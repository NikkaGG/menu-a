const { getQuery } = require('../../_lib/db');
const { requireAdmin } = require('../../_lib/admin-auth');
const { generateTableToken } = require('../../_lib/table-token');
const {
  isUniqueViolation,
  mapTable,
  validTableBody,
} = require('../../_lib/admin-tables');
const { json, methodNotAllowed } = require('../../_lib/response');

const TABLE_SELECT = 'id, number, token, created_at';
const MAX_TOKEN_ATTEMPTS = 4;

function createTablesHandler({
  query = getQuery(),
  authorize,
  generateToken = generateTableToken,
} = {}) {
  return async (request, response) => {
    if (!['GET', 'POST'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST']);
    if (!await requireAdmin(request, response, authorize)) return;

    if (request.method === 'GET') {
      try {
        const rows = await query(
          `SELECT ${TABLE_SELECT}
           FROM restaurant_tables
           ORDER BY
             CASE WHEN number ~ '^[0-9]+$' THEN number::numeric END NULLS LAST,
             lower(number),
             number,
             id`,
          [],
        );
        return json(response, 200, { tables: rows.map(mapTable) });
      } catch {
        return json(response, 500, { error: 'Unable to load tables' });
      }
    }

    if (!validTableBody(request.body)) return json(response, 400, { error: 'Invalid table' });
    const number = request.body.number.trim();
    for (let attempt = 0; attempt < MAX_TOKEN_ATTEMPTS; attempt += 1) {
      try {
        const token = generateToken();
        const rows = await query(
          `INSERT INTO restaurant_tables (number, token) VALUES ($1, $2)
           RETURNING ${TABLE_SELECT}`,
          [number, token],
        );
        return json(response, 201, { table: mapTable(rows[0]) });
      } catch (error) {
        if (isUniqueViolation(error, 'token')) continue;
        if (isUniqueViolation(error, 'number')) {
          return json(response, 409, { error: 'Table number already exists' });
        }
        if (error?.code === '23505') {
          return json(response, 409, { error: 'Table already exists' });
        }
        return json(response, 500, { error: 'Unable to create table' });
      }
    }
    return json(response, 409, { error: 'Unable to allocate a unique table token' });
  };
}

async function handler(request, response) {
  return createTablesHandler()(request, response);
}

module.exports = Object.assign(handler, { handler, createTablesHandler });
