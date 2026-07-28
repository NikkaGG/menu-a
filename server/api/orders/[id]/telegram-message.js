const { getQuery } = require('../../_lib/db');
const { authorizeBotRequest } = require('../../_lib/bot-auth');
const { exactObject, isUuid } = require('../../_lib/public-api');
const { json, methodNotAllowed } = require('../../_lib/response');

const TELEGRAM_MESSAGE_SQL = `
UPDATE orders
SET telegram_message_id = $2::bigint, updated_at = now()
WHERE id = $1
RETURNING id, telegram_message_id`;

function createTelegramMessageHandler({
  query,
  authorize = authorizeBotRequest,
} = {}) {
  return async (request, response) => {
    if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
    if (!await authorize(request, response)) return undefined;
    const id = request.query?.id;
    if (!isUuid(id)) return json(response, 400, { error: 'Invalid order id' });
    const messageId = request.body?.telegram_message_id;
    if (!exactObject(request.body, ['telegram_message_id'])
      || !Number.isSafeInteger(messageId)
      || messageId <= 0) {
      return json(response, 400, { error: 'Invalid Telegram message id' });
    }
    try {
      const rows = await (query || getQuery())(TELEGRAM_MESSAGE_SQL, [id, messageId]);
      if (!rows.length) return json(response, 404, { error: 'Order not found' });
      return json(response, 200, {
        order: {
          id: rows[0].id,
          telegramMessageId: rows[0].telegram_message_id,
        },
      });
    } catch {
      return json(response, 500, { error: 'Unable to save Telegram message id' });
    }
  };
}

async function handler(request, response) {
  return createTelegramMessageHandler()(request, response);
}

module.exports = Object.assign(handler, {
  handler,
  createTelegramMessageHandler,
  TELEGRAM_MESSAGE_SQL,
});
