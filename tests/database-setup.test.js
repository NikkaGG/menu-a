const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('restaurant ordering migration defines the table-session-order model', () => {
  const migration = read('sql/002_restaurant_ordering.sql');

  for (const table of [
    'categories',
    'dishes',
    'restaurant_tables',
    'table_sessions',
    'orders',
    'order_items',
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i'));
  }

  assert.match(migration, /dish_id\s+UUID\s+REFERENCES dishes\s*\(id\)\s+ON DELETE SET NULL/i);
  assert.match(migration, /dish_name\s+TEXT\s+NOT NULL/i);
  assert.match(migration, /dish_price\s+NUMERIC\(10,2\)\s+NOT NULL/i);
  assert.match(migration, /status\s+TEXT\s+NOT NULL\s+DEFAULT 'open'/i);
  assert.match(migration, /status\s+TEXT\s+NOT NULL\s+DEFAULT 'new'/i);
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS[\s\S]*table_sessions[\s\S]*status = 'open'/i);
});

test('admin login attempts migration stores only shared expiring digest state idempotently', () => {
  const migration = read('sql/003_admin_login_attempts.sql');

  assert.match(migration, /CREATE TABLE IF NOT EXISTS admin_login_attempts/i);
  assert.match(migration, /client_key\s+(?:TEXT|CHARACTER VARYING\(\d+\))\s+PRIMARY KEY/i);
  assert.match(migration, /failure_count\s+INTEGER\s+NOT NULL/i);
  assert.match(migration, /expires_at\s+TIMESTAMPTZ\s+NOT NULL/i);
  assert.doesNotMatch(migration, /\b(?:ip|ip_address|analytics_events)\b/i);
});

test('orders analytics migration adds an idempotent global created-at index', () => {
  const migration = read('sql/004_orders_created_at_index.sql');

  assert.match(
    migration,
    /CREATE INDEX IF NOT EXISTS\s+\w+\s+ON\s+orders\s*\(\s*created_at\s*\)/i,
  );
});

test('waiter notification migration additively stores nullable positive message ids', () => {
  const migration = read('sql/005_orders_waiter_message_id.sql');

  assert.match(
    migration,
    /ALTER TABLE\s+orders\s+ADD COLUMN IF NOT EXISTS\s+waiter_message_id\s+BIGINT/i,
  );
  assert.match(
    migration,
    /CHECK\s*\(\s*waiter_message_id\s+IS NULL\s+OR\s+waiter_message_id\s*>\s*0\s*\)/i,
  );
  assert.match(migration, /^\s*BEGIN;\s*$/im);
  assert.match(migration, /^\s*COMMIT;\s*$/im);
  assert.match(migration, /waiter_notification_claimed_at\s+TIMESTAMPTZ/i);
  assert.match(migration, /waiter_notification_claim_token\s+UUID/i);
  assert.doesNotMatch(migration, /DROP CONSTRAINT/i);
  assert.doesNotMatch(migration, /NOT NULL/i);
});

test('table token generator returns unpredictable URL-safe tokens', () => {
  const { generateTableToken } = require('../server/api/_lib/table-token');
  const tokens = new Set(Array.from({ length: 100 }, () => generateTableToken()));

  assert.equal(tokens.size, 100);
  for (const token of tokens) {
    assert.equal(token.length, 21);
    assert.match(token, /^[A-Za-z0-9_-]{21}$/);
  }
});

function parseEnvExample(contents) {
  const entries = contents
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .map((line) => {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      assert.ok(match, `invalid env example line: ${line}`);
      return match;
    });

  return {
    variables: entries.map(([, variable]) => variable),
    values: Object.fromEntries(entries.map(([, variable, value]) => [variable, value])),
  };
}

test('environment examples split web and bot runtime configuration', () => {
  const rootEnvContents = read('.env.example');
  const rootEnv = parseEnvExample(rootEnvContents);
  const botEnv = parseEnvExample(read('bot/.env.example'));

  const manuallyConfiguredVercelVariables = rootEnv.variables.slice(0, 9);
  const platformLocalVariables = rootEnv.variables.slice(9, 10);
  const localSeedVariables = rootEnv.variables.slice(10);

  assert.deepEqual(manuallyConfiguredVercelVariables, [
    'DATABASE_URL',
    'STATS_PASSWORD',
    'STATS_SESSION_SECRET',
    'BOT_INTERNAL_API_URL',
    'BOT_INTERNAL_API_SECRET',
    'ADMIN_LOGIN',
    'ADMIN_PASSWORD_HASH',
    'ADMIN_SESSION_SECRET',
    'APP_URL',
  ]);
  assert.deepEqual(platformLocalVariables, ['NODE_ENV']);
  assert.deepEqual(localSeedVariables, [
    'SEED_STAGE05_CONFIRM',
    'SEED_STAGE05_ALLOW_HOSTED',
  ]);
  assert.deepEqual(botEnv.variables, [
    'TELEGRAM_BOT_TOKEN',
    'KITCHEN_CHAT_ID',
    'WAITER_CHAT_ID',
    'BOT_INTERNAL_API_SECRET',
    'APP_URL',
    'PORT',
  ]);

  assert.equal(new Set(rootEnv.variables).size, rootEnv.variables.length);
  assert.equal(new Set(botEnv.variables).size, botEnv.variables.length);
  assert.equal(rootEnv.variables.length, 12);
  assert.deepEqual(
    rootEnv.variables.filter((variable) => botEnv.variables.includes(variable)),
    ['BOT_INTERNAL_API_SECRET', 'APP_URL'],
  );
  assert.equal(manuallyConfiguredVercelVariables.includes('NODE_ENV'), false);
  assert.equal(botEnv.variables.includes('NODE_ENV'), false);
  assert.equal(rootEnv.values.NODE_ENV, 'development');
  assert.equal(botEnv.variables.includes('DATABASE_URL'), false);
  assert.equal(botEnv.variables.includes('BOT_INTERNAL_API_URL'), false);

  for (const variable of ['BOT_INTERNAL_API_SECRET', 'APP_URL']) {
    assert.notEqual(rootEnv.values[variable], '');
    assert.equal(rootEnv.values[variable], botEnv.values[variable]);
  }
  assert.match(rootEnv.values.BOT_INTERNAL_API_SECRET, /32\+ random characters/i);
  assert.match(rootEnv.values.STATS_SESSION_SECRET, /32\+ random characters/i);
  assert.match(rootEnv.values.ADMIN_SESSION_SECRET, /32\+ random characters/i);
  assert.match(rootEnv.values.ADMIN_PASSWORD_HASH, /generated scrypt hash/i);
  assert.equal(rootEnv.values.SEED_STAGE05_CONFIRM, '');
  assert.equal(rootEnv.values.SEED_STAGE05_ALLOW_HOSTED, '0');
  assert.match(
    rootEnvContents,
    /local seed command only, never configure in Vercel production/i,
  );
  assert.match(
    rootEnvContents,
    /I_UNDERSTAND_THIS_ADDS_TEST_DATA.*1.*intentional local command/i,
  );
  assert.match(
    rootEnvContents,
    /Vercel supplies NODE_ENV=production automatically.*must not override it in Vercel/i,
  );
});
