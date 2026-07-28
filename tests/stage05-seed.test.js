const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');
const { neon } = require('@neondatabase/serverless');

const {
  CONFIRMATION,
  buildSeedData,
  buildStatements,
  formatSeedError,
  seedDatabase,
  validateEnvironment,
} = require('../scripts/seed-stage05-stats');
const { aggregate, parseRange } = require('../server/api/admin/stats');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'sql', '002_restaurant_ordering.sql'),
  'utf8',
);
const safeEnvironment = {
  NODE_ENV: 'development',
  SEED_STAGE05_CONFIRM: CONFIRMATION,
  DATABASE_URL: 'postgres://seed:secret@127.0.0.1:5432/menu',
};

function pgliteNeon(database, { failAfter } = {}) {
  const calls = [];
  const sql = () => {
    throw new Error('Seed must use the transaction API');
  };
  sql.transaction = async (buildQueries) => {
    const transactionSql = {
      query(text, params = []) {
        return { text, params };
      },
    };
    const queries = buildQueries(transactionSql);
    calls.push(queries);
    await database.exec('BEGIN');
    try {
      for (let index = 0; index < queries.length; index += 1) {
        if (index === failAfter) throw new Error('injected transaction failure');
        const query = queries[index];
        await database.query(query.text, query.params);
      }
      await database.exec('COMMIT');
    } catch (error) {
      await database.exec('ROLLBACK');
      throw error;
    }
    return queries.map(() => []);
  };
  return { factory: () => sql, calls };
}

test('safety guards reject production, missing confirmation, and hosted databases by default', () => {
  assert.throws(
    () => validateEnvironment({ ...safeEnvironment, NODE_ENV: 'production' }),
    /production/i,
  );
  assert.throws(
    () => validateEnvironment({ ...safeEnvironment, SEED_STAGE05_CONFIRM: 'yes' }),
    /SEED_STAGE05_CONFIRM/,
  );
  assert.throws(
    () => validateEnvironment({
      ...safeEnvironment,
      DATABASE_URL: 'postgres://seed:secret@example.neon.tech/menu',
    }),
    /SEED_STAGE05_ALLOW_HOSTED/,
  );
  assert.throws(
    () => validateEnvironment({ ...safeEnvironment, DATABASE_URL: 'not a url' }),
    /DATABASE_URL/,
  );
});

test('safety guards allow loopback hosts and explicit hosted opt-in', () => {
  for (const databaseUrl of [
    'postgres://seed:secret@localhost/menu',
    'postgres://seed:secret@127.0.0.1/menu',
    'postgres://seed:secret@[::1]/menu',
  ]) {
    assert.doesNotThrow(() => validateEnvironment({
      ...safeEnvironment,
      DATABASE_URL: databaseUrl,
    }));
  }
  assert.doesNotThrow(() => validateEnvironment({
    ...safeEnvironment,
    DATABASE_URL: 'postgres://seed:secret@example.neon.tech/menu',
    SEED_STAGE05_ALLOW_HOSTED: '1',
  }));
});

test('seed data is deterministic, coherent, and recalculates dates from now', () => {
  const now = new Date('2026-07-28T12:00:00.000Z');
  const first = buildSeedData(now);
  const second = buildSeedData(new Date(now));

  assert.deepEqual(first, second);
  assert.match(first.category.name, /^stage05-stats:/);
  assert.equal(first.dishes.length, 3);
  assert.ok(first.dishes.some((dish) => dish.costPrice === null));
  assert.ok(first.dishes.some((dish) => dish.costPrice !== null));
  assert.ok(first.tables.length >= 2);
  assert.ok(first.sessions.length >= 2);
  assert.ok(first.orders.length >= 6);
  assert.deepEqual(new Set(first.orders.map((order) => order.status)), new Set([
    'new',
    'cooking',
    'ready',
  ]));

  const dishById = new Map(first.dishes.map((dish) => [dish.id, dish]));
  for (const order of first.orders) {
    const items = first.orderItems.filter((item) => item.orderId === order.id);
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    assert.equal(total, order.total);
    for (const item of items) {
      const dish = dishById.get(item.dishId);
      assert.equal(item.dishName, dish.name);
      assert.equal(item.dishPrice, dish.price);
      assert.equal(item.subtotal, item.dishPrice * item.quantity);
    }
  }

  const dates = first.orders.map(({ createdAt }) => Date.parse(createdAt));
  assert.ok(Math.max(...dates) <= now.getTime());
  assert.ok(Math.min(...dates) <= now.getTime() - (14 * 86400000));
  assert.ok(Math.min(...dates) >= now.getTime() - (21 * 86400000));
  assert.notDeepEqual(
    first.orders.map(({ createdAt }) => createdAt),
    buildSeedData(new Date('2026-07-29T12:00:00.000Z')).orders
      .map(({ createdAt }) => createdAt),
  );
});

test('all seed statements avoid the analytics event store', () => {
  const sql = buildStatements(new Date('2026-07-28T12:00:00.000Z'))
    .map(({ text }) => text)
    .join('\n');
  assert.doesNotMatch(sql, /analytics_events/i);
});

test('failure reporting never echoes database URLs or credentials', () => {
  const secretUrl = 'postgres://user:password@example.neon.tech/menu';
  const message = formatSeedError(new Error(`request failed for ${secretUrl}`), secretUrl);
  assert.equal(message, 'Stage05 statistics seed failed');
  assert.doesNotMatch(message, /password|neon\.tech/);
});

test('package exposes the exact local seed command', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['seed:stats'], 'node scripts/seed-stage05-stats.js');
});

test('seed submits every statement in one Neon HTTP transaction', async () => {
  let directCalls = 0;
  let transactionCalls = 0;
  let submittedQueries;
  const sql = () => {
    directCalls += 1;
  };
  sql.transaction = async (buildQueries) => {
    transactionCalls += 1;
    submittedQueries = buildQueries({
      query: (text, params) => ({ text, params }),
    });
    return submittedQueries.map(() => []);
  };

  await seedDatabase({
    env: safeEnvironment,
    now: new Date('2026-07-28T12:00:00.000Z'),
    neonFactory: () => sql,
  });

  assert.equal(directCalls, 0);
  assert.equal(transactionCalls, 1);
  assert.deepEqual(submittedQueries, buildStatements(
    new Date('2026-07-28T12:00:00.000Z'),
  ));
});

test('installed Neon supports callback transactions with parameterized queries', async () => {
  const neonPackage = JSON.parse(fs.readFileSync(
    path.join(path.dirname(require.resolve('@neondatabase/serverless')), 'package.json'),
    'utf8',
  ));
  const packageLock = JSON.parse(fs.readFileSync(
    path.join(root, 'package-lock.json'),
    'utf8',
  ));
  const sentinel = new Error('stop before network');
  const sql = neon('postgresql://user:password@example.com/database');

  assert.equal(
    neonPackage.version,
    packageLock.packages['node_modules/@neondatabase/serverless'].version,
  );
  await assert.rejects(
    sql.transaction((tx) => {
      assert.equal(typeof tx.query, 'function');
      tx.query('SELECT $1::text AS value', ['transaction-compatible']);
      throw sentinel;
    }),
    (error) => error === sentinel,
  );
});

test('seed is idempotent when executed twice and produces useful stats data', async (t) => {
  const database = new PGlite({ extensions: { pgcrypto } });
  t.after(() => database.close());
  await database.exec(migration);
  const adapter = pgliteNeon(database);
  const options = {
    env: safeEnvironment,
    now: new Date('2026-07-28T12:00:00.000Z'),
    neonFactory: adapter.factory,
  };

  await seedDatabase(options);
  await seedDatabase(options);

  assert.equal(adapter.calls.length, 2);
  const counts = await database.query(`
    SELECT
      (SELECT count(*)::int FROM categories WHERE name LIKE 'stage05-stats:%') categories,
      (SELECT count(*)::int FROM dishes WHERE name LIKE 'Stage05 %') dishes,
      (SELECT count(*)::int FROM restaurant_tables WHERE number LIKE 'stage05-stats-%') tables,
      (SELECT count(*)::int FROM table_sessions
        WHERE id::text LIKE '53050000-%') sessions,
      (SELECT count(*)::int FROM orders WHERE id::text LIKE '54050000-%') orders,
      (SELECT count(*)::int FROM order_items WHERE id::text LIKE '55050000-%') items
  `);
  assert.deepEqual(counts.rows[0], {
    categories: 1,
    dishes: 3,
    tables: 2,
    sessions: 2,
    orders: 6,
    items: 10,
  });

  const summary = await database.query(`
    SELECT count(DISTINCT date(created_at))::int points,
      sum(total)::numeric::text revenue
    FROM orders
    WHERE id::text LIKE '54050000-%'
  `);
  assert.ok(summary.rows[0].points >= 5);
  assert.notEqual(summary.rows[0].revenue, '0');

  const stats = await aggregate(
    (text, params) => database.query(text, params).then((result) => result.rows),
    parseRange({ from: '2026-07-07', to: '2026-07-28', groupBy: 'day' }),
  );
  assert.notEqual(stats.totalRevenue, '0.00');
  assert.notEqual(stats.totalProfit, null);
  assert.ok(stats.points.some((point) => point.profit === null));
  assert.ok(stats.points.some((point) => point.profit !== null));
  assert.ok(stats.topDishes.length >= 3);
});

test('schema validation fails with a concise message', async (t) => {
  const database = new PGlite({ extensions: { pgcrypto } });
  t.after(() => database.close());
  const adapter = pgliteNeon(database);

  await assert.rejects(
    seedDatabase({
      env: safeEnvironment,
      neonFactory: adapter.factory,
      now: new Date('2026-07-28T12:00:00.000Z'),
    }),
    /Stage05 seed requires the restaurant ordering schema/,
  );
});

test('schema validation rejects a partial ordering schema before seed writes', async (t) => {
  const database = new PGlite({ extensions: { pgcrypto } });
  t.after(() => database.close());
  await database.exec(`
    CREATE TABLE categories (id UUID PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE dishes (id UUID PRIMARY KEY, category_id UUID, name TEXT,
      description TEXT, price NUMERIC, cost_price NUMERIC);
    CREATE TABLE restaurant_tables (id UUID PRIMARY KEY, number TEXT, token TEXT);
    CREATE TABLE table_sessions (id UUID PRIMARY KEY, table_id UUID, status TEXT,
      opened_at TIMESTAMPTZ, closed_at TIMESTAMPTZ);
    CREATE TABLE orders (id UUID PRIMARY KEY, session_id UUID, status TEXT,
      total NUMERIC, created_at TIMESTAMPTZ);
    CREATE TABLE order_items (id UUID PRIMARY KEY, order_id UUID, dish_id UUID,
      dish_name TEXT, dish_price NUMERIC, quantity INTEGER, subtotal NUMERIC);
  `);

  await assert.rejects(
    seedDatabase({
      env: safeEnvironment,
      neonFactory: pgliteNeon(database).factory,
      now: new Date('2026-07-28T12:00:00.000Z'),
    }),
    /Stage05 seed requires the restaurant ordering schema/,
  );
});

test('schema validation checks every dish column used by the seed', async (t) => {
  const database = new PGlite({ extensions: { pgcrypto } });
  t.after(() => database.close());
  await database.exec(migration);
  await database.exec('ALTER TABLE dishes DROP COLUMN is_available');

  await assert.rejects(
    seedDatabase({
      env: safeEnvironment,
      neonFactory: pgliteNeon(database).factory,
      now: new Date('2026-07-28T12:00:00.000Z'),
    }),
    /Stage05 seed requires the restaurant ordering schema/,
  );
});

test('an injected transaction failure rolls back all seed changes', async (t) => {
  const database = new PGlite({ extensions: { pgcrypto } });
  t.after(() => database.close());
  await database.exec(migration);
  const adapter = pgliteNeon(database, { failAfter: 4 });

  await assert.rejects(
    seedDatabase({
      env: safeEnvironment,
      neonFactory: adapter.factory,
      now: new Date('2026-07-28T12:00:00.000Z'),
    }),
    /injected transaction failure/,
  );

  const result = await database.query(
    "SELECT count(*)::int count FROM categories WHERE name LIKE 'stage05-stats:%'",
  );
  assert.equal(result.rows[0].count, 0);
});
