const { getQuery } = require('../../_lib/db');
const { authorizeBotRequest } = require('../../_lib/bot-auth');
const { exactObject, isUuid, mapOrder } = require('../../_lib/public-api');
const { json, methodNotAllowed } = require('../../_lib/response');

const STATUS_SQL = `
WITH current_order AS (
  SELECT id FROM orders WHERE id = $1
),
updated_order AS (
  UPDATE orders
  SET status = $2, updated_at = now()
  WHERE id = $1
    AND ((status = 'new' AND $2 = 'cooking')
      OR (status = 'cooking' AND $2 = 'ready'))
  RETURNING id, session_id, status, total, created_at
)
SELECT TRUE AS exists, updated.id AS order_id, updated.session_id,
       updated.status, updated.total, updated.created_at,
       COALESCE(items.items, '[]'::jsonb) AS items
FROM current_order current
LEFT JOIN updated_order updated ON updated.id = current.id
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'dishId', i.dish_id,
    'dishName', i.dish_name,
    'dishPrice', i.dish_price,
    'quantity', i.quantity,
    'subtotal', i.subtotal
  ) ORDER BY i.id) AS items
  FROM order_items i
  WHERE i.order_id = updated.id
) items ON TRUE`;

function createOrderStatusHandler({
  query,
  authorize = authorizeBotRequest,
} = {}) {
  return async (request, response) => {
    if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
    if (!await authorize(request, response)) return undefined;
    const id = request.query?.id;
    if (!isUuid(id)) return json(response, 400, { error: 'Invalid order id' });
    if (!exactObject(request.body, ['status'])
      || !['cooking', 'ready'].includes(request.body.status)) {
      return json(response, 400, { error: 'Invalid order status' });
    }
    try {
      const rows = await (query || getQuery())(STATUS_SQL, [id, request.body.status]);
      if (!rows.length) return json(response, 404, { error: 'Order not found' });
      if (!rows[0].order_id) {
        return json(response, 409, { error: 'Invalid order status transition' });
      }
      return json(response, 200, { order: mapOrder(rows[0]) });
    } catch {
      return json(response, 500, { error: 'Unable to update order status' });
    }
  };
}

async function handler(request, response) {
  return createOrderStatusHandler()(request, response);
}

module.exports = Object.assign(handler, {
  handler,
  createOrderStatusHandler,
  STATUS_SQL,
});
