const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');
const {
  CLAIM_WAITER_NOTIFICATION_SQL,
} = require('../server/api/orders/[id]/waiter-notification-claim');
const {
  SAVE_WAITER_MESSAGE_SQL,
} = require('../server/api/orders/[id]/waiter-message');

const migration = (name) =>
  fs.readFileSync(path.join(__dirname, '..', 'sql', name), 'utf8');

async function databaseWithOrders(t) {
  const database = new PGlite({ extensions: { pgcrypto } });
  t.after(() => database.close());
  await database.exec(migration('002_restaurant_ordering.sql'));
  return database;
}

async function seedOrder(database) {
  await database.exec(`
    INSERT INTO restaurant_tables (id, number, token)
    VALUES ('10000000-0000-4000-8000-000000000001', '1', 'migration-test');
    INSERT INTO table_sessions (id, table_id)
    VALUES (
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    );
    INSERT INTO orders (id, session_id, status, total)
    VALUES (
      '30000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'new',
      1.00
    );
  `);
  return '30000000-0000-4000-8000-000000000001';
}

test('waiter notification migration applies twice with columns and constraint intact', async (t) => {
  const database = await databaseWithOrders(t);
  const waiterMigration = migration('005_orders_waiter_message_id.sql');

  await database.exec(waiterMigration);
  await database.exec(waiterMigration);

  const columns = await database.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'orders'
      AND column_name IN (
        'waiter_message_id',
        'waiter_notification_claimed_at',
        'waiter_notification_claim_token'
      )
    ORDER BY column_name
  `);
  assert.deepEqual(columns.rows, [
    {
      column_name: 'waiter_message_id',
      data_type: 'bigint',
      is_nullable: 'YES',
    },
    {
      column_name: 'waiter_notification_claim_token',
      data_type: 'uuid',
      is_nullable: 'YES',
    },
    {
      column_name: 'waiter_notification_claimed_at',
      data_type: 'timestamp with time zone',
      is_nullable: 'YES',
    },
  ]);

  const constraints = await database.query(`
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'orders'::regclass
      AND conname = 'orders_waiter_message_id_positive'
  `);
  assert.equal(constraints.rows.length, 1);
  const orderId = await seedOrder(database);
  await assert.rejects(
    database.exec(
      `UPDATE orders SET waiter_message_id = -1 WHERE id = '${orderId}'`,
    ),
  );
});

test('waiter notification claim is exclusive, stale-reclaimable, and first-save-wins', async (t) => {
  const database = await databaseWithOrders(t);
  await database.exec(migration('005_orders_waiter_message_id.sql'));
  const orderId = await seedOrder(database);

  const first = await database.query(CLAIM_WAITER_NOTIFICATION_SQL, [orderId]);
  const firstToken = first.rows[0].claim_token;
  assert.ok(firstToken);

  const denied = await database.query(CLAIM_WAITER_NOTIFICATION_SQL, [orderId]);
  assert.equal(denied.rows[0].claim_token, null);

  await database.exec(`
    UPDATE orders
    SET waiter_notification_claimed_at = now() - INTERVAL '3 minutes'
    WHERE id = '${orderId}'
  `);
  const reclaimed = await database.query(
    CLAIM_WAITER_NOTIFICATION_SQL,
    [orderId],
  );
  const reclaimedToken = reclaimed.rows[0].claim_token;
  assert.ok(reclaimedToken);
  assert.notEqual(reclaimedToken, firstToken);

  const saved = await database.query(SAVE_WAITER_MESSAGE_SQL, [
    orderId,
    77,
    reclaimedToken,
  ]);
  assert.equal(Number(saved.rows[0].waiter_message_id), 77);
  assert.equal(saved.rows[0].saved, true);

  const secondSave = await database.query(SAVE_WAITER_MESSAGE_SQL, [
    orderId,
    88,
    reclaimedToken,
  ]);
  assert.equal(Number(secondSave.rows[0].waiter_message_id), 77);
  assert.equal(secondSave.rows[0].saved, false);
});

test('waiter notification migration rolls back all DDL when its transaction fails', async (t) => {
  const database = await databaseWithOrders(t);
  const broken = migration('005_orders_waiter_message_id.sql').replace(
    'COMMIT;',
    'SELECT * FROM definitely_missing_table; COMMIT;',
  );

  await assert.rejects(database.exec(broken));
  await database.exec('ROLLBACK');

  const columns = await database.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'orders'
      AND column_name LIKE 'waiter_%'
  `);
  assert.deepEqual(columns.rows, []);
});
