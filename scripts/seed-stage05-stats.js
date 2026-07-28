const { neon } = require('@neondatabase/serverless');

const CONFIRMATION = 'I_UNDERSTAND_THIS_ADDS_TEST_DATA';
const DAY_MS = 24 * 60 * 60 * 1000;
const SCHEMA_ERROR = 'Stage05 seed requires the restaurant ordering schema';

const IDS = Object.freeze({
  category: '50050000-0000-4000-8000-000000000001',
  dishes: [
    '51050000-0000-4000-8000-000000000001',
    '51050000-0000-4000-8000-000000000002',
    '51050000-0000-4000-8000-000000000003',
  ],
  tables: [
    '52050000-0000-4000-8000-000000000001',
    '52050000-0000-4000-8000-000000000002',
  ],
  sessions: [
    '53050000-0000-4000-8000-000000000001',
    '53050000-0000-4000-8000-000000000002',
  ],
  orders: Array.from(
    { length: 6 },
    (_, index) => `54050000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  ),
  orderItems: Array.from(
    { length: 10 },
    (_, index) => `55050000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  ),
});

function relativeIso(now, days, hours = 0) {
  return new Date(now.getTime() - (days * DAY_MS) + (hours * 60 * 60 * 1000))
    .toISOString();
}

function buildSeedData(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('Seed now must be a valid Date');
  }

  const category = {
    id: IDS.category,
    name: 'stage05-stats: local analytics demo',
    sortOrder: 905,
  };
  const dishes = [
    {
      id: IDS.dishes[0],
      categoryId: category.id,
      name: 'Stage05 Salmon Roll',
      description: 'Deterministic statistics seed dish',
      price: 12.5,
      costPrice: 5,
      isAvailable: true,
      sortOrder: 1,
    },
    {
      id: IDS.dishes[1],
      categoryId: category.id,
      name: 'Stage05 Vegetable Tempura',
      description: 'Deterministic statistics seed dish',
      price: 9,
      costPrice: 3.5,
      isAvailable: true,
      sortOrder: 2,
    },
    {
      id: IDS.dishes[2],
      categoryId: category.id,
      name: 'Stage05 Lemonade',
      description: 'Cost intentionally unavailable for mixed profit points',
      price: 4,
      costPrice: null,
      isAvailable: true,
      sortOrder: 3,
    },
  ];
  const tables = [
    {
      id: IDS.tables[0],
      number: 'stage05-stats-1',
      token: 'stage05-stats-table-one',
    },
    {
      id: IDS.tables[1],
      number: 'stage05-stats-2',
      token: 'stage05-stats-table-two',
    },
  ];
  const sessions = [
    {
      id: IDS.sessions[0],
      tableId: tables[0].id,
      status: 'closed',
      openedAt: relativeIso(now, 21),
      closedAt: relativeIso(now, 1),
    },
    {
      id: IDS.sessions[1],
      tableId: tables[1].id,
      status: 'open',
      openedAt: relativeIso(now, 21),
      closedAt: null,
    },
  ];

  const orderDefinitions = [
    [0, 20, -2, 'ready'],
    [1, 16, 1, 'cooking'],
    [0, 12, -1, 'ready'],
    [1, 8, 2, 'new'],
    [0, 4, 0, 'cooking'],
    [1, 1, 1, 'ready'],
  ];
  const itemDefinitions = [
    [[0, 2], [2, 1]],
    [[1, 3]],
    [[0, 1], [1, 2]],
    [[2, 5]],
    [[0, 3], [1, 1]],
    [[0, 1], [1, 2]],
  ];
  let itemIndex = 0;
  const orderItems = [];
  const orders = orderDefinitions.map(
    ([sessionIndex, daysAgo, hourOffset, status], orderIndex) => {
      let total = 0;
      for (const [dishIndex, quantity] of itemDefinitions[orderIndex]) {
        const dish = dishes[dishIndex];
        const subtotal = dish.price * quantity;
        total += subtotal;
        orderItems.push({
          id: IDS.orderItems[itemIndex],
          orderId: IDS.orders[orderIndex],
          dishId: dish.id,
          dishName: dish.name,
          dishPrice: dish.price,
          quantity,
          subtotal,
        });
        itemIndex += 1;
      }
      const createdAt = relativeIso(now, daysAgo, hourOffset);
      return {
        id: IDS.orders[orderIndex],
        sessionId: sessions[sessionIndex].id,
        status,
        total,
        createdAt,
        updatedAt: createdAt,
      };
    },
  );

  return {
    category,
    dishes,
    tables,
    sessions,
    orders,
    orderItems,
  };
}

function values(rows, columns) {
  const params = [];
  const placeholders = rows.map((row) => {
    const rowPlaceholders = columns.map((column) => {
      params.push(row[column]);
      return `$${params.length}`;
    });
    return `(${rowPlaceholders.join(', ')})`;
  });
  return { params, sql: placeholders.join(',\n') };
}

function query(text, params = []) {
  return { text, params };
}

function buildStatements(now = new Date()) {
  const data = buildSeedData(now);
  const dishValues = values(data.dishes, [
    'id',
    'categoryId',
    'name',
    'description',
    'price',
    'costPrice',
    'isAvailable',
    'sortOrder',
  ]);
  const tableValues = values(data.tables, ['id', 'number', 'token']);
  const sessionValues = values(data.sessions, [
    'id',
    'tableId',
    'status',
    'openedAt',
    'closedAt',
  ]);
  const orderValues = values(data.orders, [
    'id',
    'sessionId',
    'status',
    'total',
    'createdAt',
    'updatedAt',
  ]);
  const itemValues = values(data.orderItems, [
    'id',
    'orderId',
    'dishId',
    'dishName',
    'dishPrice',
    'quantity',
    'subtotal',
  ]);

  return [
    query(`
      DO $seed$
      BEGIN
        IF to_regclass('public.categories') IS NULL
          OR to_regclass('public.dishes') IS NULL
          OR to_regclass('public.restaurant_tables') IS NULL
          OR to_regclass('public.table_sessions') IS NULL
          OR to_regclass('public.orders') IS NULL
          OR to_regclass('public.order_items') IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'dishes'
              AND column_name = 'cost_price'
          )
          OR EXISTS (
            SELECT 1
            FROM (VALUES
              ('categories', 'id'), ('categories', 'name'), ('categories', 'sort_order'),
              ('dishes', 'id'), ('dishes', 'category_id'), ('dishes', 'name'),
              ('dishes', 'description'), ('dishes', 'price'), ('dishes', 'cost_price'),
              ('dishes', 'is_available'), ('dishes', 'sort_order'), ('dishes', 'updated_at'),
              ('restaurant_tables', 'id'), ('restaurant_tables', 'number'),
              ('restaurant_tables', 'token'),
              ('table_sessions', 'id'), ('table_sessions', 'table_id'),
              ('table_sessions', 'status'), ('table_sessions', 'opened_at'),
              ('table_sessions', 'closed_at'),
              ('orders', 'id'), ('orders', 'session_id'), ('orders', 'status'),
              ('orders', 'total'), ('orders', 'created_at'), ('orders', 'updated_at'),
              ('order_items', 'id'), ('order_items', 'order_id'), ('order_items', 'dish_id'),
              ('order_items', 'dish_name'), ('order_items', 'dish_price'),
              ('order_items', 'quantity'), ('order_items', 'subtotal')
            ) AS required(table_name, column_name)
            WHERE NOT EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = required.table_name
                AND column_name = required.column_name
            )
          )
        THEN
          RAISE EXCEPTION '${SCHEMA_ERROR}';
        END IF;
      END
      $seed$
    `),
    query(`
      INSERT INTO categories (id, name, sort_order)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        sort_order = EXCLUDED.sort_order
    `, [data.category.id, data.category.name, data.category.sortOrder]),
    query(`
      INSERT INTO dishes
        (id, category_id, name, description, price, cost_price, is_available, sort_order)
      VALUES ${dishValues.sql}
      ON CONFLICT (id) DO UPDATE SET
        category_id = EXCLUDED.category_id,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        price = EXCLUDED.price,
        cost_price = EXCLUDED.cost_price,
        is_available = EXCLUDED.is_available,
        sort_order = EXCLUDED.sort_order,
        updated_at = now()
    `, dishValues.params),
    query(`
      INSERT INTO restaurant_tables (id, number, token)
      VALUES ${tableValues.sql}
      ON CONFLICT (id) DO UPDATE SET
        number = EXCLUDED.number,
        token = EXCLUDED.token
    `, tableValues.params),
    query(
      'DELETE FROM order_items WHERE order_id = ANY($1::uuid[])',
      [IDS.orders],
    ),
    query('DELETE FROM orders WHERE id = ANY($1::uuid[])', [IDS.orders]),
    query(
      'DELETE FROM table_sessions WHERE id = ANY($1::uuid[])',
      [IDS.sessions],
    ),
    query(`
      INSERT INTO table_sessions
        (id, table_id, status, opened_at, closed_at)
      VALUES ${sessionValues.sql}
    `, sessionValues.params),
    query(`
      INSERT INTO orders
        (id, session_id, status, total, created_at, updated_at)
      VALUES ${orderValues.sql}
      ON CONFLICT (id) DO UPDATE SET
        session_id = EXCLUDED.session_id,
        status = EXCLUDED.status,
        total = EXCLUDED.total,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at
    `, orderValues.params),
    query(`
      INSERT INTO order_items
        (id, order_id, dish_id, dish_name, dish_price, quantity, subtotal)
      VALUES ${itemValues.sql}
      ON CONFLICT (id) DO UPDATE SET
        order_id = EXCLUDED.order_id,
        dish_id = EXCLUDED.dish_id,
        dish_name = EXCLUDED.dish_name,
        dish_price = EXCLUDED.dish_price,
        quantity = EXCLUDED.quantity,
        subtotal = EXCLUDED.subtotal
    `, itemValues.params),
  ];
}

function validateEnvironment(env = process.env) {
  if (String(env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('Stage05 statistics seed is disabled in production');
  }
  if (env.SEED_STAGE05_CONFIRM !== CONFIRMATION) {
    throw new Error(`Set SEED_STAGE05_CONFIRM=${CONFIRMATION} to continue`);
  }
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  let databaseUrl;
  try {
    databaseUrl = new URL(env.DATABASE_URL);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }

  const hostname = databaseUrl.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (!loopbackHosts.has(hostname) && env.SEED_STAGE05_ALLOW_HOSTED !== '1') {
    throw new Error('Set SEED_STAGE05_ALLOW_HOSTED=1 to seed a hosted database');
  }
  return env.DATABASE_URL;
}

async function seedDatabase({
  env = process.env,
  now = new Date(),
  neonFactory = neon,
} = {}) {
  const databaseUrl = validateEnvironment(env);
  const statements = buildStatements(now);
  const sql = neonFactory(databaseUrl);
  try {
    await sql.transaction((transactionSql) => statements.map(
      ({ text, params }) => transactionSql.query(text, params),
    ));
  } catch (error) {
    if (String(error && error.message).includes(SCHEMA_ERROR)) {
      throw new Error(SCHEMA_ERROR);
    }
    throw error;
  }
  return {
    categories: 1,
    dishes: 3,
    tables: 2,
    sessions: 2,
    orders: 6,
    orderItems: 10,
  };
}

async function main() {
  const result = await seedDatabase();
  process.stdout.write(
    `Stage05 statistics seed complete: ${result.orders} orders, `
      + `${result.orderItems} items.\n`,
  );
}

function formatSeedError(error) {
  const message = String(error && error.message);
  const safeMessages = new Set([
    'Stage05 statistics seed is disabled in production',
    `Set SEED_STAGE05_CONFIRM=${CONFIRMATION} to continue`,
    'DATABASE_URL is required',
    'DATABASE_URL must be a valid PostgreSQL URL',
    'Set SEED_STAGE05_ALLOW_HOSTED=1 to seed a hosted database',
    SCHEMA_ERROR,
  ]);
  return safeMessages.has(message) ? message : 'Stage05 statistics seed failed';
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${formatSeedError(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  CONFIRMATION,
  IDS,
  buildSeedData,
  buildStatements,
  formatSeedError,
  main,
  seedDatabase,
  validateEnvironment,
};
