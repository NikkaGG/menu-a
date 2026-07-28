const test = require('node:test');
const assert = require('node:assert/strict');

const tableId = '33333333-3333-4333-8333-333333333333';
const authorized = async () => true;

function responseHarness() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = String(value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    end(value) {
      this.body = value;
      return this;
    },
  };
}

async function invoke(handler, request) {
  const response = responseHarness();
  await handler(request, response);
  return response;
}

test('table route modules export direct handlers and injectable factories', () => {
  const routes = [
    ['../api/admin/tables/index.js', 'createTablesHandler'],
    ['../api/admin/tables/[id]/index.js', 'createTableHandler'],
    ['../api/admin/tables/[id]/qr.js', 'createTableQrHandler'],
  ];
  for (const [route, factory] of routes) {
    const exported = require(route);
    assert.equal(typeof exported, 'function');
    assert.equal(typeof exported[factory], 'function');
  }
});

test('table collection fails authorization closed before database access', async () => {
  const { createTablesHandler } = require('../api/admin/tables/index.js');
  let queryCalls = 0;
  const query = async () => { queryCalls += 1; return []; };

  const denied = await invoke(createTablesHandler({ query }), { method: 'GET' });
  assert.equal(denied.statusCode, 401);
  assert.equal(queryCalls, 0);

  const throwing = await invoke(createTablesHandler({
    query,
    authorize: async () => { throw new Error('authorization secret'); },
  }), { method: 'GET' });
  assert.equal(throwing.statusCode, 401);
  assert.equal(queryCalls, 0);
  assert.doesNotMatch(JSON.stringify(throwing.body), /secret/i);
});

test('table collection lists mapped tables in human-friendly stable order', async () => {
  const { createTablesHandler } = require('../api/admin/tables/index.js');
  const calls = [];
  const handler = createTablesHandler({
    authorize: authorized,
    query: async (sql, values) => {
      calls.push({ sql, values });
      return [{
        id: tableId,
        number: '12',
        token: 'abcdefghijklmnopqrstu',
        created_at: '2026-01-01T00:00:00Z',
      }];
    },
  });

  const response = await invoke(handler, { method: 'GET' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    tables: [{
      id: tableId,
      number: '12',
      token: 'abcdefghijklmnopqrstu',
      createdAt: '2026-01-01T00:00:00Z',
      qrUrl: `/api/admin/tables/${tableId}/qr`,
    }],
  });
  assert.match(calls[0].sql, /ORDER BY[\s\S]*number[\s\S]*id/i);
  assert.deepEqual(calls[0].values, []);
});

test('table creation accepts exact number body, trims it, and generates token server-side', async () => {
  const { createTablesHandler } = require('../api/admin/tables/index.js');
  const calls = [];
  const handler = createTablesHandler({
    authorize: authorized,
    generateToken: () => 'server-generated-token',
    query: async (sql, values) => {
      calls.push({ sql, values });
      return [{
        id: tableId,
        number: values[0],
        token: values[1],
        created_at: 'created',
      }];
    },
  });
  const response = await invoke(handler, {
    method: 'POST',
    body: { number: '  Patio 2  ' },
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(calls[0].values, ['Patio 2', 'server-generated-token']);
  assert.match(calls[0].sql, /INSERT INTO restaurant_tables \(number, token\) VALUES \(\$1, \$2\)/i);
  assert.equal(response.body.table.qrUrl, `/api/admin/tables/${tableId}/qr`);
});

test('table collection validates exact body and methods without database access', async () => {
  const { createTablesHandler } = require('../api/admin/tables/index.js');
  let calls = 0;
  const handler = createTablesHandler({
    authorize: authorized,
    query: async () => { calls += 1; return []; },
  });
  for (const body of [
    null,
    {},
    { number: '' },
    { number: '   ' },
    { number: 12 },
    { number: 'x'.repeat(101) },
    { number: '1', token: 'client-token' },
  ]) {
    const response = await invoke(handler, { method: 'POST', body });
    assert.equal(response.statusCode, 400);
  }
  assert.equal(calls, 0);

  const method = await invoke(handler, { method: 'DELETE' });
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.allow, 'GET, POST');
});

test('table creation reports duplicate numbers and retries bounded token collisions', async () => {
  const { createTablesHandler } = require('../api/admin/tables/index.js');
  let duplicateCalls = 0;
  const duplicate = await invoke(createTablesHandler({
    authorize: authorized,
    generateToken: () => 'does-not-matter',
    query: async () => {
      duplicateCalls += 1;
      const error = new Error('sensitive number value');
      error.code = '23505';
      error.constraint = 'restaurant_tables_number_key';
      throw error;
    },
  }), { method: 'POST', body: { number: '4' } });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicateCalls, 1);
  assert.doesNotMatch(JSON.stringify(duplicate.body), /sensitive/i);

  const generated = [];
  let insertCalls = 0;
  const retried = await invoke(createTablesHandler({
    authorize: authorized,
    generateToken: () => {
      const token = `token-${generated.length}`;
      generated.push(token);
      return token;
    },
    query: async (sql, values) => {
      insertCalls += 1;
      if (insertCalls < 3) {
        const error = new Error('token leaked');
        error.code = '23505';
        error.constraint = 'restaurant_tables_token_key';
        throw error;
      }
      return [{ id: tableId, number: values[0], token: values[1], created_at: 'created' }];
    },
  }), { method: 'POST', body: { number: '5' } });
  assert.equal(retried.statusCode, 201);
  assert.equal(insertCalls, 3);
  assert.deepEqual(generated, ['token-0', 'token-1', 'token-2']);
});

test('table item validates method and UUID before database access', async () => {
  const { createTableHandler } = require('../api/admin/tables/[id]/index.js');
  let calls = 0;
  const handler = createTableHandler({
    authorize: authorized,
    query: async () => { calls += 1; return []; },
  });
  const method = await invoke(handler, { method: 'GET', query: { id: tableId } });
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.allow, 'DELETE');
  const invalid = await invoke(handler, { method: 'DELETE', query: { id: 'bad' } });
  assert.equal(invalid.statusCode, 400);
  assert.equal(calls, 0);
});

test('table deletion distinguishes missing, open, and historical sessions', async () => {
  const { createTableHandler } = require('../api/admin/tables/[id]/index.js');
  const request = { method: 'DELETE', query: { id: tableId } };

  const missing = await invoke(createTableHandler({
    authorize: authorized,
    query: async () => [],
  }), request);
  assert.equal(missing.statusCode, 404);

  const open = await invoke(createTableHandler({
    authorize: authorized,
    query: async () => [{ id: tableId, session_count: 2, has_open_session: true }],
  }), request);
  assert.equal(open.statusCode, 409);
  assert.match(open.body.error, /open session/i);

  const history = await invoke(createTableHandler({
    authorize: authorized,
    query: async () => [{ id: tableId, session_count: 2, has_open_session: false }],
  }), request);
  assert.equal(history.statusCode, 409);
  assert.match(history.body.error, /history/i);
});

test('table deletion succeeds only without session history and hides failures', async () => {
  const { createTableHandler } = require('../api/admin/tables/[id]/index.js');
  const calls = [];
  const success = await invoke(createTableHandler({
    authorize: authorized,
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (calls.length === 1) {
        return [{ id: tableId, session_count: 0, has_open_session: false }];
      }
      return [{ id: tableId }];
    },
  }), { method: 'DELETE', query: { id: tableId } });
  assert.equal(success.statusCode, 200);
  assert.deepEqual(success.body, { deleted: true });
  assert.match(calls[0].sql, /table_sessions/i);
  assert.match(calls[1].sql, /DELETE FROM restaurant_tables WHERE id = \$1/i);
  assert.deepEqual(calls[1].values, [tableId]);

  const restricted = await invoke(createTableHandler({
    authorize: authorized,
    query: async (sql) => {
      if (/SELECT/i.test(sql)) return [{ id: tableId, session_count: 0, has_open_session: false }];
      const error = new Error('foreign key detail');
      error.code = '23503';
      throw error;
    },
  }), { method: 'DELETE', query: { id: tableId } });
  assert.equal(restricted.statusCode, 409);
  assert.doesNotMatch(JSON.stringify(restricted.body), /foreign key detail/i);
});

test('QR endpoint validates auth, method, UUID, missing table, and APP_URL', async () => {
  const { createTableQrHandler } = require('../api/admin/tables/[id]/qr.js');
  let calls = 0;
  const query = async () => {
    calls += 1;
    return [{ id: tableId, number: '7', token: 'abcdefghijklmnopqrstu' }];
  };
  const denied = await invoke(createTableQrHandler({ query }), {
    method: 'GET', query: { id: tableId },
  });
  assert.equal(denied.statusCode, 401);
  assert.equal(calls, 0);

  const method = await invoke(createTableQrHandler({ query, authorize: authorized }), {
    method: 'POST', query: { id: tableId },
  });
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.allow, 'GET');
  assert.equal(calls, 0);

  const invalid = await invoke(createTableQrHandler({ query, authorize: authorized }), {
    method: 'GET', query: { id: 'bad' },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(calls, 0);

  const missing = await invoke(createTableQrHandler({
    authorize: authorized,
    query: async () => [],
    env: { APP_URL: 'https://menu.example' },
  }), { method: 'GET', query: { id: tableId } });
  assert.equal(missing.statusCode, 404);

  for (const env of [
    {},
    { APP_URL: 'menu.example' },
    { APP_URL: 'javascript:alert(1)' },
    { APP_URL: 'http://menu.example', NODE_ENV: 'production' },
  ]) {
    let encoded = false;
    const response = await invoke(createTableQrHandler({
      authorize: authorized,
      query,
      env,
      encodeQr: async () => { encoded = true; return Buffer.from('png'); },
    }), { method: 'GET', query: { id: tableId }, headers: { host: 'attacker.example' } });
    assert.equal(response.statusCode, 500);
    assert.equal(encoded, false);
    assert.doesNotMatch(JSON.stringify(response.body), /APP_URL|menu\.example/i);
  }
});

test('QR endpoint encodes exact normalized URL and returns private PNG attachment', async () => {
  const { createTableQrHandler } = require('../api/admin/tables/[id]/qr.js');
  const payloads = [];
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
  const response = await invoke(createTableQrHandler({
    authorize: authorized,
    env: { APP_URL: 'https://menu.example///', NODE_ENV: 'production' },
    query: async () => [{
      id: tableId,
      number: 'Patio / 7',
      token: 'abcdefghijklmnopqrstu',
    }],
    encodeQr: async (payload, options) => {
      payloads.push({ payload, options });
      return png;
    },
  }), {
    method: 'GET',
    query: { id: tableId },
    headers: { host: 'attacker.example' },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(payloads[0].payload, 'https://menu.example/t/abcdefghijklmnopqrstu');
  assert.equal(payloads[0].options.type, 'png');
  assert.equal(payloads[0].options.errorCorrectionLevel, 'H');
  assert.ok(payloads[0].options.margin >= 2);
  assert.ok(payloads[0].options.width >= 256);
  assert.equal(response.headers['content-type'], 'image/png');
  assert.equal(response.headers['cache-control'], 'private, no-store');
  assert.match(response.headers['content-disposition'], /^attachment; filename="table-Patio___7\.png"$/);
  assert.deepEqual(response.body, png);
});

test('QR endpoint produces a real PNG with the trusted QR package', async () => {
  const { createTableQrHandler } = require('../api/admin/tables/[id]/qr.js');
  const response = await invoke(createTableQrHandler({
    authorize: authorized,
    env: { APP_URL: 'http://localhost:3000', NODE_ENV: 'test' },
    query: async () => [{
      id: tableId,
      number: '8',
      token: 'abcdefghijklmnopqrstu',
    }],
  }), { method: 'GET', query: { id: tableId } });

  assert.equal(response.statusCode, 200);
  assert.ok(Buffer.isBuffer(response.body));
  assert.deepEqual([...response.body.subarray(0, 8)], [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
});