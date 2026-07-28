const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TABLE_TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

function isUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

function isTableToken(value) {
  return typeof value === 'string' && TABLE_TOKEN.test(value);
}

function exactObject(value, fields) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).every((key) => fields.includes(key));
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '0.00';
}

function mapItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    dishId: item.dishId ?? item.dish_id,
    dishName: item.dishName ?? item.dish_name,
    dishPrice: money(item.dishPrice ?? item.dish_price),
    quantity: Number(item.quantity),
    subtotal: money(item.subtotal),
  }));
}

function mapOrder(row) {
  const order = {
    id: row.order_id ?? row.id,
    sessionId: row.session_id,
    status: row.status,
    total: money(row.total),
    createdAt: row.created_at,
    items: mapItems(row.items),
  };
  if (row.table_number !== undefined && row.table_number !== null) {
    order.table = { number: row.table_number };
  }
  return order;
}

function validOrderBody(body) {
  if (!exactObject(body, ['session_id', 'items'])
    || !isUuid(body.session_id)
    || !Array.isArray(body.items)
    || body.items.length < 1
    || body.items.length > 100) return false;
  return body.items.every((item) => exactObject(item, ['dish_id', 'quantity'])
    && isUuid(item.dish_id)
    && Number.isInteger(item.quantity)
    && item.quantity >= 1
    && item.quantity <= 99);
}

module.exports = {
  exactObject,
  isTableToken,
  isUuid,
  mapItems,
  mapOrder,
  money,
  validOrderBody,
};
