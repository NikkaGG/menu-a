const { getQuery } = require('../_lib/db');
const { createOrderNotifier } = require('../_lib/order-notification');
const { mapOrder, validOrderBody } = require('../_lib/public-api');
const { json, methodNotAllowed } = require('../_lib/response');

const CREATE_ORDER_SQL = `
WITH requested AS (
  SELECT dish_id, quantity
  FROM jsonb_to_recordset($2::jsonb) AS item(dish_id uuid, quantity integer)
),
available AS (
  SELECT r.dish_id, r.quantity, d.name, d.price
  FROM requested r
  JOIN dishes d ON d.id = r.dish_id AND d.is_available = TRUE
),
excluded AS (
  SELECT COALESCE(jsonb_agg(DISTINCT r.dish_id), '[]'::jsonb) AS dish_ids
  FROM requested r
  LEFT JOIN dishes d ON d.id = r.dish_id AND d.is_available = TRUE
  WHERE d.id IS NULL
),
session_info AS (
  SELECT s.id, s.status, t.number AS table_number
  FROM table_sessions s
  JOIN restaurant_tables t ON t.id = s.table_id
  WHERE s.id = $1::uuid
  FOR UPDATE OF s
),
calculated AS (
  SELECT COALESCE(sum(price * quantity), 0)::numeric(10,2) AS total,
         count(*) AS item_count
  FROM available
),
inserted_order AS (
  INSERT INTO orders (session_id, status, total)
  SELECT $1::uuid, 'new', calculated.total
  FROM calculated
  JOIN session_info session ON session.status = 'open'
  WHERE calculated.item_count > 0
  RETURNING id, session_id, status, total, created_at
),
inserted_items AS (
  INSERT INTO order_items
    (order_id, dish_id, dish_name, dish_price, quantity, subtotal)
  SELECT o.id, a.dish_id, a.name, a.price, a.quantity,
         (a.price * a.quantity)::numeric(10,2)
  FROM inserted_order o
  CROSS JOIN available a
  RETURNING dish_id, dish_name, dish_price, quantity, subtotal
),
serialized_items AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'dishId', dish_id,
    'dishName', dish_name,
    'dishPrice', dish_price,
    'quantity', quantity,
    'subtotal', subtotal
  )), '[]'::jsonb) AS items
  FROM inserted_items
)
SELECT o.id AS order_id, o.session_id, o.status, o.total, o.created_at,
       serialized_items.items, excluded.dish_ids AS excluded_dish_ids,
       (SELECT status FROM session_info) AS session_status,
       (SELECT table_number FROM session_info) AS table_number
FROM excluded
CROSS JOIN serialized_items
LEFT JOIN inserted_order o ON TRUE`;

function notifyWithoutFailing(notify, order, timeoutMs, logger) {
  return new Promise((resolve) => {
    let settled = false;
    const controller = new AbortController();
    const finish = (warning) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        if (warning) {
          try {
            logger.warn(warning);
          } catch {}
        }
        resolve();
      }
    };
    const timer = setTimeout(() => {
      controller.abort();
      finish('Order bot notification timed out');
    }, timeoutMs);
    Promise.resolve()
      .then(() => notify(order, controller.signal))
      .then(() => finish(), () => finish('Order bot notification rejected'));
  });
}

function createOrderHandler({
  query = getQuery(),
  notify = createOrderNotifier(),
  logger = console,
  notificationTimeoutMs = 1000,
} = {}) {
  return async (request, response) => {
    if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
    if (!validOrderBody(request.body)) return json(response, 400, { error: 'Invalid order' });
    try {
      const values = [request.body.session_id, JSON.stringify(request.body.items)];
      const rows = await query(CREATE_ORDER_SQL, values);
      const row = rows[0];
      const excludedDishIds = row?.excluded_dish_ids || [];
      if (!row?.session_status) {
        return json(response, 404, { error: 'Session not found' });
      }
      if (row.session_status !== 'open') {
        return json(response, 409, { error: 'Session is not open' });
      }
      if (!row?.order_id) {
        return json(response, 409, {
          error: 'No requested dishes are available',
          excludedDishIds,
        });
      }
      const order = mapOrder(row);
      await notifyWithoutFailing(notify, order, notificationTimeoutMs, logger);
      return json(response, 201, { order, excludedDishIds });
    } catch {
      return json(response, 500, { error: 'Unable to create order' });
    }
  };
}

async function handler(request, response) {
  return createOrderHandler()(request, response);
}

module.exports = Object.assign(handler, {
  handler,
  createOrderHandler,
  CREATE_ORDER_SQL,
});
