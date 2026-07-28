const { getQuery } = require('../../../_lib/db');
const { requireAdmin } = require('../../../_lib/admin-auth');
const { isUuid } = require('../../../_lib/public-api');
const { json, methodNotAllowed } = require('../../../_lib/response');

function createTableHandler({ query = getQuery(), authorize } = {}) {
  return async (request, response) => {
    if (request.method !== 'DELETE') return methodNotAllowed(response, ['DELETE']);
    if (!await requireAdmin(request, response, authorize)) return;

    const id = request.query?.id;
    if (!isUuid(id)) return json(response, 400, { error: 'Invalid table id' });

    try {
      const rows = await query(
        `SELECT t.id,
                COUNT(s.id)::integer AS session_count,
                COALESCE(BOOL_OR(s.status = 'open'), false) AS has_open_session
         FROM restaurant_tables t
         LEFT JOIN table_sessions s ON s.table_id = t.id
         WHERE t.id = $1
         GROUP BY t.id`,
        [id],
      );
      if (!rows.length) return json(response, 404, { error: 'Table not found' });

      const table = rows[0];
      if (table.has_open_session) {
        return json(response, 409, { error: 'Table has an open session' });
      }
      if (Number(table.session_count) > 0) {
        return json(response, 409, { error: 'Table has session history and cannot be deleted' });
      }

      const deleted = await query('DELETE FROM restaurant_tables WHERE id = $1 RETURNING id', [id]);
      if (!deleted.length) return json(response, 404, { error: 'Table not found' });
      return json(response, 200, { deleted: true });
    } catch (error) {
      if (error?.code === '23503') {
        return json(response, 409, { error: 'Table has session history and cannot be deleted' });
      }
      return json(response, 500, { error: 'Unable to delete table' });
    }
  };
}

async function handler(request, response) {
  return createTableHandler()(request, response);
}

module.exports = Object.assign(handler, { handler, createTableHandler });
