const { getQuery } = require('../../_lib/db');
const { requireAdmin } = require('../../_lib/admin-auth');
const {
  DISH_FIELDS,
  mapDish,
  normalizedValue,
  validDishBody,
} = require('../../_lib/admin-menu');
const { isUuid } = require('../../_lib/public-api');
const { json, methodNotAllowed } = require('../../_lib/response');

const DISH_SELECT = `
id, category_id, name, description, price, cost_price, photo_url,
is_available, sort_order, created_at, updated_at`;

function createDishHandler({ query = getQuery(), authorize } = {}) {
  return async (request, response) => {
    if (!['PATCH', 'DELETE'].includes(request.method)) {
      return methodNotAllowed(response, ['PATCH', 'DELETE']);
    }
    if (!await requireAdmin(request, response, authorize)) return;
    const id = request.query?.id;
    if (!isUuid(id)) return json(response, 400, { error: 'Invalid dish id' });

    if (request.method === 'PATCH') {
      if (!validDishBody(request.body, true)) return json(response, 400, { error: 'Invalid dish' });
      const fields = DISH_FIELDS.filter((field) => Object.hasOwn(request.body, field));
      const values = fields.map((field) => normalizedValue(field, request.body[field]));
      const assignments = fields.map((field, index) => `${field} = $${index + 1}`);
      values.push(id);
      try {
        const rows = await query(
          `UPDATE dishes SET ${assignments.join(', ')}, updated_at = now()
           WHERE id = $${values.length} RETURNING ${DISH_SELECT}`,
          values,
        );
        if (!rows.length) return json(response, 404, { error: 'Dish not found' });
        return json(response, 200, { dish: mapDish(rows[0]) });
      } catch (error) {
        if (error?.code === '23503') return json(response, 400, { error: 'Invalid category' });
        return json(response, 500, { error: 'Unable to update dish' });
      }
    }

    try {
      const rows = await query('DELETE FROM dishes WHERE id = $1 RETURNING id', [id]);
      if (!rows.length) return json(response, 404, { error: 'Dish not found' });
      return json(response, 200, { deleted: true });
    } catch {
      return json(response, 500, { error: 'Unable to delete dish' });
    }
  };
}

async function handler(request, response) {
  return createDishHandler()(request, response);
}

module.exports = Object.assign(handler, { handler, createDishHandler });
