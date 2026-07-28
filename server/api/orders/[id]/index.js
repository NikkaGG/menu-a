const { getQuery } = require('../../_lib/db');
const { isUuid, mapOrder } = require('../../_lib/public-api');
const { json, methodNotAllowed } = require('../../_lib/response');

const ORDER_DETAILS_SQL = `
SELECT o.id AS order_id, o.session_id, o.status, o.total, o.created_at,
       t.number AS table_number,
       COALESCE(jsonb_agg(jsonb_build_object(
         'dishId', i.dish_id,
         'dishName', i.dish_name,
         'dishPrice', i.dish_price,
         'quantity', i.quantity,
         'subtotal', i.subtotal
       ) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]'::jsonb) AS items
FROM orders o
JOIN table_sessions s ON s.id = o.session_id
JOIN restaurant_tables t ON t.id = s.table_id
LEFT JOIN order_items i ON i.order_id = o.id
WHERE o.id = $1
GROUP BY o.id, t.number`;

function createOrderDetailsHandler({ query = getQuery() } = {}) {
  return async (request, response) => {
    if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
    const id = request.query?.id;
    if (!isUuid(id)) return json(response, 400, { error: 'Invalid order id' });
    try {
      const rows = await query(ORDER_DETAILS_SQL, [id]);
      if (!rows.length) return json(response, 404, { error: 'Order not found' });
      return json(response, 200, { order: mapOrder(rows[0]) });
    } catch {
      return json(response, 500, { error: 'Unable to load order' });
    }
  };
}

async function handler(request, response) {
  return createOrderDetailsHandler()(request, response);
}

module.exports = Object.assign(handler, {
  handler,
  createOrderDetailsHandler,
  ORDER_DETAILS_SQL,
});
