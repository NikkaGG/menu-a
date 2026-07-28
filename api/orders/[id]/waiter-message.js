const { getQuery } = require('../../_lib/db');
const { authorizeBotRequest } = require('../../_lib/bot-auth');
const { exactObject, isUuid } = require('../../_lib/public-api');
const { json, methodNotAllowed } = require('../../_lib/response');

const GET_WAITER_MESSAGE_SQL = `
SELECT id, waiter_message_id
FROM orders
WHERE id = $1`;

const SAVE_WAITER_MESSAGE_SQL = `
WITH current_order AS (
  SELECT id, waiter_message_id
  FROM orders
  WHERE id = $1
),
saved AS (
  UPDATE orders
  SET waiter_message_id = $2::bigint,
      waiter_notification_claimed_at = NULL,
      waiter_notification_claim_token = NULL,
      updated_at = now()
  WHERE id = $1
    AND waiter_message_id IS NULL
    AND waiter_notification_claim_token = $3::uuid
  RETURNING id, waiter_message_id
)
SELECT current_order.id,
       COALESCE(saved.waiter_message_id, current_order.waiter_message_id)
         AS waiter_message_id,
       saved.id IS NOT NULL AS saved
FROM current_order
LEFT JOIN saved ON saved.id = current_order.id`;

function orderPayload(row) {
  return {
    order: {
      id: row.id,
      waiterMessageId: row.waiter_message_id,
    },
  };
}

function createWaiterMessageHandler({
  query,
  authorize = authorizeBotRequest,
} = {}) {
  return async (request, response) => {
    if (!['GET', 'POST'].includes(request.method)) {
      return methodNotAllowed(response, ['GET', 'POST']);
    }
    if (!await authorize(request, response)) return undefined;
    const id = request.query?.id;
    if (!isUuid(id)) return json(response, 400, { error: 'Invalid order id' });

    if (request.method === 'POST') {
      const messageId = request.body?.waiter_message_id;
      const claimToken = request.body?.claim_token;
      if (!exactObject(request.body, ['waiter_message_id', 'claim_token'])
        || !Number.isSafeInteger(messageId)
        || messageId <= 0
        || !isUuid(claimToken)) {
        return json(response, 400, { error: 'Invalid waiter message id' });
      }
      try {
        const rows = await (query || getQuery())(
          SAVE_WAITER_MESSAGE_SQL,
          [id, messageId, claimToken],
        );
        if (!rows.length) return json(response, 404, { error: 'Order not found' });
        if (rows[0].waiter_message_id === null) {
          return json(response, 409, { error: 'Waiter notification claim lost' });
        }
        return json(response, 200, orderPayload(rows[0]));
      } catch {
        return json(response, 500, { error: 'Unable to save waiter message id' });
      }
    }

    try {
      const rows = await (query || getQuery())(GET_WAITER_MESSAGE_SQL, [id]);
      if (!rows.length) return json(response, 404, { error: 'Order not found' });
      return json(response, 200, orderPayload(rows[0]));
    } catch {
      return json(response, 500, { error: 'Unable to load waiter message id' });
    }
  };
}

async function handler(request, response) {
  return createWaiterMessageHandler()(request, response);
}

module.exports = Object.assign(handler, {
  handler,
  createWaiterMessageHandler,
  GET_WAITER_MESSAGE_SQL,
  SAVE_WAITER_MESSAGE_SQL,
});
