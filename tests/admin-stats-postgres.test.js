const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');
const { aggregate, parseRange } = require('../server/api/admin/stats');

const migration = (name) => fs.readFileSync(path.join(__dirname, '..', 'sql', name), 'utf8');

test('admin stats executes production aggregation SQL against PostgreSQL semantics', async (t) => {
  const database = new PGlite({ extensions: { pgcrypto } });
  t.after(() => database.close());

  await database.exec(migration('002_restaurant_ordering.sql'));
  await database.exec(migration('004_orders_created_at_index.sql'));
  await database.exec(`
    INSERT INTO categories (id, name)
    VALUES ('10000000-0000-4000-8000-000000000001', 'Test');
    INSERT INTO dishes (id, category_id, name, price, cost_price) VALUES
      ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Eligible', 30.00, 20.00),
      ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'ProfitDish', 20.00, 10.00),
      ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'NullCost', 20.00, NULL),
      ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'DeletedDish', 10.00, 1.00);
    INSERT INTO restaurant_tables (id, number, token)
    VALUES ('30000000-0000-4000-8000-000000000001', '1', 'integration-test');
    INSERT INTO table_sessions (id, table_id)
    VALUES ('30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001');

    INSERT INTO orders (id, session_id, status, total, created_at) VALUES
      ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'new', 100.00, '2026-02-28T19:00:00.000Z'),
      ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'cooking', 60.00, '2026-03-01T07:00:00.000Z'),
      ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000002', 'ready', 40.00, '2026-03-01T19:00:00.000Z'),
      ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000002', 'new', 50.02, '2026-03-02T08:00:00.000Z'),
      ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000002', 'ready', 999.00, '2026-03-02T19:00:00.000Z');

    INSERT INTO order_items
      (id, order_id, dish_id, dish_name, dish_price, quantity, subtotal)
    VALUES
      ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Eligible', 30.00, 2, 60.00),
      ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', 'NullCost', 20.00, 2, 40.00),
      ('50000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'ProfitDish', 20.00, 3, 60.00),
      ('50000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004', 'DeletedDish', 10.00, 4, 40.00),
      ('50000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000003', 'NullOnly', 10.00, 5, 50.00),
      ('50000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000004', NULL, 'Alpha', 1.00, 2, 2.00),
      ('50000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000004', NULL, 'Beta', 1.00, 2, 2.00),
      ('50000000-0000-4000-8000-000000000008', '40000000-0000-4000-8000-000000000004', NULL, 'Zeta', 1.00, 2, 2.00),
      ('50000000-0000-4000-8000-000000000009', '40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', 'Excluded', 999.00, 1, 999.00);

    DELETE FROM dishes WHERE id = '20000000-0000-4000-8000-000000000004';
  `);

  const query = async (sql, values) => (await database.query(sql, values)).rows;
  const range = parseRange({
    from: '2026-03-01',
    to: '2026-03-02',
    groupBy: 'day',
  });

  assert.deepEqual(await aggregate(query, range), {
    totalRevenue: '250.02',
    totalProfit: '50.00',
    orderCount: 4,
    averageCheck: '62.51',
    points: [
      { date: '2026-03-01', revenue: '160.00', profit: '50.00' },
      { date: '2026-03-02', revenue: '90.02', profit: null },
    ],
    topDishes: [
      { dish_name: 'NullOnly', quantity: 5 },
      { dish_name: 'DeletedDish', quantity: 4 },
      { dish_name: 'ProfitDish', quantity: 3 },
      { dish_name: 'Alpha', quantity: 2 },
      { dish_name: 'Beta', quantity: 2 },
    ],
  });

  const emptyRange = parseRange({
    from: '2026-04-01',
    to: '2026-04-01',
    groupBy: 'day',
  });
  assert.deepEqual(await aggregate(query, emptyRange), {
    totalRevenue: '0.00',
    totalProfit: null,
    orderCount: 0,
    averageCheck: null,
    points: [],
    topDishes: [],
  });
});
