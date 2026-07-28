const { getQuery } = require('../_lib/db');
const { authorizeBotRequest } = require('../_lib/bot-auth');
const { money } = require('../_lib/public-api');
const { json, methodNotAllowed } = require('../_lib/response');

const OPEN_SESSIONS_SQL = `
SELECT s.id AS session_id, t.id AS table_id, t.number AS table_number,
       count(o.id) AS order_count,
       COALESCE(sum(o.total), 0)::numeric(10,2) AS total
FROM table_sessions s
JOIN restaurant_tables t ON t.id = s.table_id
LEFT JOIN orders o ON o.session_id = s.id
WHERE s.status = 'open'
GROUP BY s.id, t.id
ORDER BY
  CASE WHEN t.number ~ '^[0-9]+$' THEN t.number::numeric END NULLS LAST,
  lower(t.number),
  t.number,
  t.id`;

function createOpenSessionsHandler({
  query,
  authorize = authorizeBotRequest,
} = {}) {
  return async (request, response) => {
    if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
    if (!await authorize(request, response)) return undefined;
    try {
      const rows = await (query || getQuery())(OPEN_SESSIONS_SQL);
      return json(response, 200, {
        tables: rows.map((row) => ({
          sessionId: row.session_id,
          table: { id: row.table_id, number: row.table_number },
          orderCount: Number(row.order_count),
          total: money(row.total),
        })),
      });
    } catch {
      return json(response, 500, { error: 'Unable to load open tables' });
    }
  };
}

async function handler(request, response) {
  return createOpenSessionsHandler()(request, response);
}

module.exports = Object.assign(handler, {
  handler,
  createOpenSessionsHandler,
  OPEN_SESSIONS_SQL,
});
