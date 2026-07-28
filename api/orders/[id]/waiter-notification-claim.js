const { getQuery } = require('../../_lib/db');
const { authorizeBotRequest } = require('../../_lib/bot-auth');
const { exactObject, isUuid } = require('../../_lib/public-api');
const { json, methodNotAllowed } = require('../../_lib/response');

const CLAIM_WAITER_NOTIFICATION_SQL = `
WITH target AS (
  SELECT id, waiter_message_id
  FROM orders
  WHERE id = $1
),
claimed AS (
  UPDATE orders
  SET waiter_notification_claimed_at = now(),
      waiter_notification_claim_token = gen_random_uuid(),
      updated_at = now()
  WHERE id = $1
    AND waiter_message_id IS NULL
    AND (
      waiter_notification_claimed_at IS NULL
      OR waiter_notification_claimed_at < now() - INTERVAL '2 minutes'
    )
  RETURNING id, waiter_message_id, waiter_notification_claim_token
)
SELECT target.id, target.waiter_message_id,
       claimed.waiter_notification_claim_token AS claim_token
FROM target
LEFT JOIN claimed ON claimed.id = target.id`;

const RELEASE_WAITER_NOTIFICATION_SQL = `
UPDATE orders
SET waiter_notification_claimed_at = NULL,
    waiter_notification_claim_token = NULL,
    updated_at = now()
WHERE id = $1
  AND waiter_message_id IS NULL
  AND waiter_notification_claim_token = $2::uuid
RETURNING id`;

function createWaiterNotificationClaimHandler({
  query,
  authorize = authorizeBotRequest,
} = {}) {
  return async (request, response) => {
    if (!['POST', 'DELETE'].includes(request.method)) {
      return methodNotAllowed(response, ['POST', 'DELETE']);
    }
    if (!await authorize(request, response)) return undefined;
    const id = request.query?.id;
    if (!isUuid(id)) return json(response, 400, { error: 'Invalid order id' });

    if (request.method === 'POST') {
      if (!exactObject(request.body, [])) {
        return json(response, 400, { error: 'Invalid claim request' });
      }
      try {
        const rows = await (query || getQuery())(
          CLAIM_WAITER_NOTIFICATION_SQL,
          [id],
        );
        if (!rows.length) return json(response, 404, { error: 'Order not found' });
        return json(response, 200, {
          order: {
            id: rows[0].id,
            waiterMessageId: rows[0].waiter_message_id,
            waiterNotificationClaimToken: rows[0].claim_token,
          },
        });
      } catch {
        return json(response, 500, { error: 'Unable to claim waiter notification' });
      }
    }

    const claimToken = request.body?.claim_token;
    if (!exactObject(request.body, ['claim_token']) || !isUuid(claimToken)) {
      return json(response, 400, { error: 'Invalid claim token' });
    }
    try {
      const rows = await (query || getQuery())(
        RELEASE_WAITER_NOTIFICATION_SQL,
        [id, claimToken],
      );
      return json(response, 200, { released: rows.length > 0 });
    } catch {
      return json(response, 500, { error: 'Unable to release waiter notification' });
    }
  };
}

async function handler(request, response) {
  return createWaiterNotificationClaimHandler()(request, response);
}

module.exports = Object.assign(handler, {
  handler,
  createWaiterNotificationClaimHandler,
  CLAIM_WAITER_NOTIFICATION_SQL,
  RELEASE_WAITER_NOTIFICATION_SQL,
});
