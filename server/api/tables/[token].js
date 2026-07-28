const { getQuery } = require('../_lib/db');
const { isTableToken } = require('../_lib/public-api');
const { json, methodNotAllowed } = require('../_lib/response');

function createTableHandler({ query = getQuery() } = {}) {
  return async (request, response) => {
    if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
    const token = request.query?.token;
    if (!isTableToken(token)) return json(response, 400, { error: 'Invalid table token' });
    try {
      const rows = await query(
        `WITH selected_table AS (
           SELECT id, number FROM restaurant_tables WHERE token = $1
         ),
         open_session AS (
           INSERT INTO table_sessions (table_id)
           SELECT id FROM selected_table
           ON CONFLICT (table_id) WHERE status = 'open'
           DO UPDATE SET table_id = EXCLUDED.table_id
           RETURNING id, table_id, status, opened_at
         )
         SELECT t.id AS table_id, t.number AS table_number,
                s.id AS session_id, s.status AS session_status, s.opened_at
         FROM selected_table t
         JOIN open_session s ON s.table_id = t.id`,
        [token],
      );
      if (!rows.length) return json(response, 404, { error: 'Table not found' });
      const row = rows[0];
      return json(response, 200, {
        table: { id: row.table_id, number: row.table_number },
        session: {
          id: row.session_id,
          status: row.session_status,
          openedAt: row.opened_at,
        },
      });
    } catch {
      return json(response, 500, { error: 'Unable to resolve table' });
    }
  };
}

async function handler(request, response) {
  return createTableHandler()(request, response);
}

module.exports = Object.assign(handler, { handler, createTableHandler });
