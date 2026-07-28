const { getQuery } = require('../../_lib/db');
const { requireAdmin } = require('../../_lib/admin-auth');
const { mapDish, normalizedValue, validDishBody } = require('../../_lib/admin-menu');
const { json, methodNotAllowed } = require('../../_lib/response');

const DISH_SELECT = `
id, category_id, name, description, price, cost_price, photo_url,
is_available, sort_order, created_at, updated_at`;

function createDishesHandler({ query = getQuery(), authorize } = {}) {
  return async (request, response) => {
    if (!['GET', 'POST'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST']);
    if (!await requireAdmin(request, response, authorize)) return;
    if (request.method === 'POST') {
      if (!validDishBody(request.body)) return json(response, 400, { error: 'Invalid dish' });
      const body = request.body;
      const values = [
        body.category_id,
        normalizedValue('name', body.name),
        body.description ?? null,
        body.price,
        body.cost_price ?? null,
        body.photo_url ?? null,
        body.is_available ?? true,
        body.sort_order ?? 0,
      ];
      try {
        const rows = await query(
          `INSERT INTO dishes
             (category_id, name, description, price, cost_price, photo_url, is_available, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING ${DISH_SELECT}`,
          values,
        );
        return json(response, 201, { dish: mapDish(rows[0]) });
      } catch (error) {
        if (error?.code === '23503') return json(response, 400, { error: 'Invalid category' });
        return json(response, 500, { error: 'Unable to create dish' });
      }
    }
    try {
      const rows = await query(`SELECT ${DISH_SELECT} FROM dishes ORDER BY sort_order, id`);
      return json(response, 200, { dishes: rows.map(mapDish) });
    } catch {
      return json(response, 500, { error: 'Unable to load dishes' });
    }
  };
}

async function handler(request, response) {
  return createDishesHandler()(request, response);
}

module.exports = Object.assign(handler, { handler, createDishesHandler });
