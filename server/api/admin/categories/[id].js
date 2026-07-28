const { getQuery } = require('../../_lib/db');
const { requireAdmin } = require('../../_lib/admin-auth');
const {
  CATEGORY_FIELDS,
  mapCategory,
  normalizedValue,
  validCategoryBody,
} = require('../../_lib/admin-menu');
const { isUuid } = require('../../_lib/public-api');
const { json, methodNotAllowed } = require('../../_lib/response');

const CATEGORY_SELECT = 'id, name, sort_order, created_at';

function createCategoryHandler({ query = getQuery(), authorize } = {}) {
  return async (request, response) => {
    if (!['PATCH', 'DELETE'].includes(request.method)) {
      return methodNotAllowed(response, ['PATCH', 'DELETE']);
    }
    if (!await requireAdmin(request, response, authorize)) return;
    const id = request.query?.id;
    if (!isUuid(id)) return json(response, 400, { error: 'Invalid category id' });

    if (request.method === 'PATCH') {
      if (!validCategoryBody(request.body, true)) {
        return json(response, 400, { error: 'Invalid category' });
      }
      const fields = CATEGORY_FIELDS.filter((field) => Object.hasOwn(request.body, field));
      const values = fields.map((field) => normalizedValue(field, request.body[field]));
      const assignments = fields.map((field, index) => `${field} = $${index + 1}`);
      values.push(id);
      try {
        const rows = await query(
          `UPDATE categories SET ${assignments.join(', ')}
           WHERE id = $${values.length} RETURNING ${CATEGORY_SELECT}`,
          values,
        );
        if (!rows.length) return json(response, 404, { error: 'Category not found' });
        return json(response, 200, { category: mapCategory(rows[0]) });
      } catch {
        return json(response, 500, { error: 'Unable to update category' });
      }
    }

    try {
      const rows = await query('DELETE FROM categories WHERE id = $1 RETURNING id', [id]);
      if (!rows.length) return json(response, 404, { error: 'Category not found' });
      return json(response, 200, { deleted: true });
    } catch (error) {
      if (error?.code === '23503') return json(response, 409, { error: 'Category is in use' });
      return json(response, 500, { error: 'Unable to delete category' });
    }
  };
}

async function handler(request, response) {
  return createCategoryHandler()(request, response);
}

module.exports = Object.assign(handler, { handler, createCategoryHandler });
