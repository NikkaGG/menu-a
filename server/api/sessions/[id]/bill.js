const { getQuery } = require('../../_lib/db');
const { authorizeBotRequest } = require('../../_lib/bot-auth');
const { isUuid, mapOrder, money } = require('../../_lib/public-api');
const { json, methodNotAllowed } = require('../../_lib/response');

const BILL_SQL = `
SELECT s.id AS session_id, s.status, s.opened_at, s.closed_at,
       t.id AS table_id, t.number AS table_number,
       COALESCE(sum(o.total), 0)::numeric(10,2) AS total,
       COALESCE(jsonb_agg(jsonb_build_object(
         'order_id', o.id,
         'session_id', o.session_id,
         'status', o.status,
         'total', o.total,
         'created_at', o.created_at,
         'items', COALESCE(items.items, '[]'::jsonb)
       ) ORDER BY o.created_at, o.id) FILTER (WHERE o.id IS NOT NULL), '[]'::jsonb) AS orders
FROM table_sessions s
JOIN restaurant_tables t ON t.id = s.table_id
LEFT JOIN orders o ON o.session_id = s.id
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'dishId', i.dish_id,
    'dishName', i.dish_name,
    'dishPrice', i.dish_price,
    'quantity', i.quantity,
    'subtotal', i.subtotal
  ) ORDER BY i.id) AS items
  FROM order_items i
  WHERE i.order_id = o.id
) items ON TRUE
WHERE s.id = $1
GROUP BY s.id, t.id`;

function createBillHandler({
  query,
  authorize = authorizeBotRequest,
} = {}) {
  return async (request, response) => {
    if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
    if (!await authorize(request, response)) return undefined;
    const id = request.query?.id;
    if (!isUuid(id)) return json(response, 400, { error: 'Invalid session id' });
    try {
      const rows = await (query || getQuery())(BILL_SQL, [id]);
      if (!rows.length) return json(response, 404, { error: 'Session not found' });
      const row = rows[0];
      return json(response, 200, {
        session: {
          id: row.session_id,
          status: row.status,
          openedAt: row.opened_at,
          closedAt: row.closed_at,
        },
        table: { id: row.table_id, number: row.table_number },
        orders: (Array.isArray(row.orders) ? row.orders : []).map(mapOrder),
        total: money(row.total),
      });
    } catch {
      return json(response, 500, { error: 'Unable to load bill' });
    }
  };
}

async function handler(request, response) {
  return createBillHandler()(request, response);
}

module.exports = Object.assign(handler, { handler, createBillHandler, BILL_SQL });
