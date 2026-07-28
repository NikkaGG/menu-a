const { getQuery } = require('./_lib/db');
const { money } = require('./_lib/public-api');
const { json, methodNotAllowed } = require('./_lib/response');

function createMenuHandler({ query = getQuery() } = {}) {
  return async (request, response) => {
    if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
    try {
      const rows = await query(
        `SELECT c.id AS category_id, c.name AS category_name,
                d.id AS dish_id, d.name AS dish_name, d.description,
                d.price, d.photo_url
         FROM categories c
         JOIN dishes d ON d.category_id = c.id
         WHERE d.is_available = TRUE
         ORDER BY c.sort_order, c.id, d.sort_order, d.id`,
      );
      const categories = [];
      const byId = new Map();
      for (const row of rows) {
        let category = byId.get(row.category_id);
        if (!category) {
          category = { id: row.category_id, name: row.category_name, dishes: [] };
          byId.set(row.category_id, category);
          categories.push(category);
        }
        category.dishes.push({
          id: row.dish_id,
          name: row.dish_name,
          description: row.description,
          price: money(row.price),
          photoUrl: row.photo_url,
        });
      }
      return json(response, 200, { categories });
    } catch {
      return json(response, 500, { error: 'Unable to load menu' });
    }
  };
}

async function handler(request, response) {
  return createMenuHandler()(request, response);
}

module.exports = Object.assign(handler, { handler, createMenuHandler });
