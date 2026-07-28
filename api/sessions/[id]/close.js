const { getQuery } = require('../../_lib/db');
const { authorizeBotRequest } = require('../../_lib/bot-auth');
const { exactObject, isUuid } = require('../../_lib/public-api');
const { json, methodNotAllowed } = require('../../_lib/response');

const CLOSE_SESSION_SQL = `
WITH current_session AS (
  SELECT id FROM table_sessions WHERE id = $1
),
closed_session AS (
  UPDATE table_sessions
  SET status = 'closed', closed_at = now()
  WHERE id = $1 AND status = 'open'
  RETURNING id, status, opened_at, closed_at
)
SELECT TRUE AS exists, closed.id, closed.status, closed.opened_at, closed.closed_at
FROM current_session current
LEFT JOIN closed_session closed ON closed.id = current.id`;

function createCloseSessionHandler({
  query,
  authorize = authorizeBotRequest,
} = {}) {
  return async (request, response) => {
    if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
    if (!await authorize(request, response)) return undefined;
    const id = request.query?.id;
    if (!isUuid(id)) return json(response, 400, { error: 'Invalid session id' });
    if (request.body !== undefined && !exactObject(request.body, [])) {
      return json(response, 400, { error: 'Invalid request' });
    }
    try {
      const rows = await (query || getQuery())(CLOSE_SESSION_SQL, [id]);
      if (!rows.length) return json(response, 404, { error: 'Session not found' });
      const row = rows[0];
      if (!row.id) return json(response, 409, { error: 'Session is already closed' });
      return json(response, 200, {
        session: {
          id: row.id,
          status: row.status,
          openedAt: row.opened_at,
          closedAt: row.closed_at,
        },
      });
    } catch {
      return json(response, 500, { error: 'Unable to close session' });
    }
  };
}

async function handler(request, response) {
  return createCloseSessionHandler()(request, response);
}

module.exports = Object.assign(handler, {
  handler,
  createCloseSessionHandler,
  CLOSE_SESSION_SQL,
});
