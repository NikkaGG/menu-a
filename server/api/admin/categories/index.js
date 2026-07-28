const { getQuery } = require('../../_lib/db');
const { requireAdmin } = require('../../_lib/admin-auth');
const { mapCategory, normalizedValue, validCategoryBody } = require('../../_lib/admin-menu');
const { json, methodNotAllowed } = require('../../_lib/response');

const CATEGORY_SELECT = 'id, name, sort_order, created_at';

function createCategoriesHandler({ query = getQuery(), authorize } = {}) {
  return async (request, response) => {
    if (!['GET', 'POST'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST']);
    if (!await requireAdmin(request, response, authorize)) return;
    if (request.method === 'POST') {
      if (!validCategoryBody(request.body)) return json(response, 400, { error: 'Invalid category' });
      try {
        const body = request.body;
        const rows = await query(
          `INSERT INTO categories (name, sort_order) VALUES ($1, $2) RETURNING ${CATEGORY_SELECT}`,
          [normalizedValue('name', body.name), body.sort_order ?? 0],
        );
        return json(response, 201, { category: mapCategory(rows[0]) });
      } catch (error) {
        if (error?.code === '23503') return json(response, 400, { error: 'Invalid category' });
        return json(response, 500, { error: 'Unable to create category' });
      }
    }
    try {
      const rows = await query(
        `SELECT ${CATEGORY_SELECT} FROM categories ORDER BY sort_order, id`,
        [],
      );
      return json(response, 200, { categories: rows.map(mapCategory) });
    } catch {
      return json(response, 500, { error: 'Unable to load categories' });
    }
  };
}

async function handler(request, response) {
  return createCategoriesHandler()(request, response);
}

module.exports = Object.assign(handler, { handler, createCategoriesHandler });
