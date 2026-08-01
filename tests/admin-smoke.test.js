const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const smokePath = path.resolve(__dirname, '..', 'scripts', 'admin-smoke.js');

function response(status, body = {}, headers = {}) {
  const payload = status === 204 ? null : (typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body));
  return new Response(payload, { status, headers });
}

function baseEnv(overrides = {}) {
  return {
    ADMIN_SMOKE_BASE_URL: 'https://preview.example.test',
    ADMIN_SMOKE_LOGIN: 'operator',
    ADMIN_SMOKE_PASSWORD: 'super-secret-password',
    ADMIN_SMOKE_READONLY_TABLE_ID: 'existing-table',
    ...overrides,
  };
}

function successfulFetch(calls, overrides = {}) {
  return async (url, init = {}) => {
    const pathname = new URL(url).pathname;
    const method = init.method || 'GET';
    calls.push({ pathname, method, init });
    if (pathname === '/api/admin/login') {
      return response(200, { ok: true }, { 'set-cookie': 'admin_session=private-cookie; Path=/; HttpOnly' });
    }
    if (pathname === '/api/admin/logout') return response(200, { ok: true });
    if (overrides[`${method} ${pathname}`]) return overrides[`${method} ${pathname}`](url, init);
    if (pathname.startsWith('/admin-next')) {
      return response(200, '<link rel="stylesheet" href="/admin-dist/assets/app-Ab12cd34.css"><script src="/admin-dist/assets/app-Xy98kl76.js"></script>', { 'content-type': 'text/html' });
    }
    if (pathname.startsWith('/admin-dist/assets/')) return response(200, 'asset');
    if (pathname === '/api/admin/session') return response(200, { authenticated: true });
    if (pathname === '/api/admin/stats') return response(200, { points: [], topDishes: [] });
    if (pathname === '/api/admin/categories') return response(200, { categories: [] });
    if (pathname === '/api/admin/dishes') return response(200, { dishes: [] });
    if (pathname === '/api/admin/tables') return response(200, { tables: [{ id: 'existing-table' }] });
    if (pathname === '/api/admin/tables/existing-table/qr') {
      return response(200, new Uint8Array([137, 80, 78, 71]), { 'content-type': 'image/png' });
    }
    throw new Error(`Unexpected test request: ${method} ${pathname}`);
  };
}

test('read-only mode verifies shell, assets, APIs, and QR without mutations', async () => {
  const { runAdminSmoke } = require(smokePath);
  const calls = [];
  const result = await runAdminSmoke({ env: baseEnv(), fetchImpl: successfulFetch(calls), logger: { log() {}, error() {} } });

  assert.equal(result.mode, 'readonly');
  assert.deepEqual(calls.filter(({ method }) => ['POST', 'PATCH', 'DELETE'].includes(method)).map(({ pathname, method }) => [method, pathname]), [
    ['POST', '/api/admin/login'],
    ['POST', '/api/admin/logout'],
  ]);
  for (const route of ['/admin-next', '/admin-next/menu', '/admin-next/tables', '/admin-next/stats']) {
    assert.ok(calls.some(({ pathname }) => pathname === route), route);
  }
  assert.ok(calls.some(({ pathname }) => pathname === '/api/admin/tables/existing-table/qr'));
  const authenticated = calls.filter(({ pathname }) => pathname !== '/api/admin/login');
  assert.ok(authenticated.every(({ init }) => init.headers.Cookie === 'admin_session=private-cookie'));
});

test('preview mode creates, verifies, and cleans table, dish, category in order', async () => {
  const { runAdminSmoke } = require(smokePath);
  const calls = [];
  const fetchImpl = successfulFetch(calls, {
    'POST /api/admin/categories': async () => response(201, { category: { id: 'category-created' } }),
    'POST /api/admin/dishes': async () => response(201, { dish: { id: 'dish-created' } }),
    'POST /api/admin/tables': async () => response(201, { table: { id: 'table-created' } }),
    'GET /api/admin/categories': async () => response(200, { categories: [{ id: 'category-created' }] }),
    'GET /api/admin/dishes': async () => response(200, { dishes: [{ id: 'dish-created' }] }),
    'GET /api/admin/tables': async () => response(200, { tables: [{ id: 'table-created' }] }),
    'GET /api/admin/tables/table-created/qr': async () => response(200, new Uint8Array([137, 80, 78, 71]), { 'content-type': 'image/png' }),
    'DELETE /api/admin/tables/table-created': async () => response(204, ''),
    'DELETE /api/admin/dishes/dish-created': async () => response(204, ''),
    'DELETE /api/admin/categories/category-created': async () => response(204, ''),
  });

  const result = await runAdminSmoke({
    env: baseEnv({ ADMIN_SMOKE_PREFIX: 'branch-42', ADMIN_SMOKE_READONLY_TABLE_ID: undefined }),
    fetchImpl,
    logger: { log() {}, error() {} },
    now: () => 123,
    random: () => 0.5,
  });

  assert.deepEqual(result, { mode: 'preview', tableId: 'table-created' });
  assert.deepEqual(calls.filter(({ method }) => method === 'DELETE').map(({ pathname }) => pathname), [
    '/api/admin/tables/table-created',
    '/api/admin/dishes/dish-created',
    '/api/admin/categories/category-created',
  ]);
  const bodies = calls.filter(({ method, pathname }) => method === 'POST' && !['/api/admin/login', '/api/admin/logout'].includes(pathname))
    .map(({ init }) => JSON.parse(init.body));
  assert.ok(JSON.stringify(bodies).includes('branch-42'));
  assert.equal(bodies.find((body) => body.category_id)?.price, 1);
});

test('partial preview setup cleans every ID that was created', async () => {
  const { runAdminSmoke } = require(smokePath);
  const calls = [];
  const fetchImpl = successfulFetch(calls, {
    'POST /api/admin/categories': async () => response(201, { category: { id: 'category-created' } }),
    'POST /api/admin/dishes': async () => response(201, { dish: { id: 'dish-created' } }),
    'POST /api/admin/tables': async () => response(500, { error: 'hidden detail' }),
    'DELETE /api/admin/dishes/dish-created': async () => response(204, ''),
    'DELETE /api/admin/categories/category-created': async () => response(204, ''),
  });

  await assert.rejects(
    runAdminSmoke({ env: baseEnv({ ADMIN_SMOKE_PREFIX: 'partial', ADMIN_SMOKE_READONLY_TABLE_ID: undefined }), fetchImpl, sleep: async () => {}, logger: { log() {}, error() {} } }),
    /smoke request failed/i,
  );
  assert.deepEqual(calls.filter(({ method }) => method === 'DELETE').map(({ pathname }) => pathname), [
    '/api/admin/dishes/dish-created',
    '/api/admin/categories/category-created',
  ]);
});

test('cleanup accepts 404 and retries only transient statuses with exact backoff', async (t) => {
  const { cleanupResource } = require(smokePath);
  for (const transient of [408, 425, 429, 500, 503]) {
    await t.test(String(transient), async () => {
      const sleeps = [];
      let attempts = 0;
      await cleanupResource({
        path: '/resource',
        request: async () => response(++attempts <= 3 ? transient : 204, ''),
        sleep: async (milliseconds) => sleeps.push(milliseconds),
      });
      assert.equal(attempts, 4);
      assert.deepEqual(sleeps, [250, 1000, 2000]);
    });
  }
  let attempts = 0;
  await cleanupResource({ path: '/resource', request: async () => { attempts += 1; return response(404); }, sleep: async () => {} });
  assert.equal(attempts, 1);
});

test('cleanup retries network errors and fails after initial plus three retries', async () => {
  const { cleanupResource } = require(smokePath);
  const sleeps = [];
  let attempts = 0;
  await assert.rejects(cleanupResource({
    path: '/resource',
    request: async () => { attempts += 1; throw new Error('socket secret'); },
    sleep: async (milliseconds) => sleeps.push(milliseconds),
  }), /cleanup failed/i);
  assert.equal(attempts, 4);
  assert.deepEqual(sleeps, [250, 1000, 2000]);
});

test('cleanup fails transient HTTP exhaustion after initial plus three retries', async () => {
  const { cleanupResource } = require(smokePath);
  let attempts = 0;
  await assert.rejects(cleanupResource({
    path: '/resource',
    request: async () => { attempts += 1; return response(502); },
    sleep: async () => {},
  }), /cleanup failed.*HTTP 502/i);
  assert.equal(attempts, 4);
});

test('cleanup does not retry deterministic 4xx responses', async () => {
  const { cleanupResource } = require(smokePath);
  for (const status of [400, 401, 403, 409, 422]) {
    let attempts = 0;
    await assert.rejects(cleanupResource({
      path: '/resource',
      request: async () => { attempts += 1; return response(status); },
      sleep: async () => assert.fail('must not sleep'),
    }), /cleanup failed/i);
    assert.equal(attempts, 1);
  }
});

test('preview cleanup attempts every created resource even when earlier cleanup fails', async () => {
  const { runAdminSmoke } = require(smokePath);
  const calls = [];
  const fetchImpl = successfulFetch(calls, {
    'POST /api/admin/categories': async () => response(201, { category: { id: 'category-created' } }),
    'POST /api/admin/dishes': async () => response(201, { dish: { id: 'dish-created' } }),
    'POST /api/admin/tables': async () => response(201, { table: { id: 'table-created' } }),
    'GET /api/admin/categories': async () => response(200, { categories: [{ id: 'category-created' }] }),
    'GET /api/admin/dishes': async () => response(200, { dishes: [{ id: 'dish-created' }] }),
    'GET /api/admin/tables': async () => response(200, { tables: [{ id: 'table-created' }] }),
    'GET /api/admin/tables/table-created/qr': async () => response(200, new Uint8Array([137, 80, 78, 71]), { 'content-type': 'image/png' }),
    'DELETE /api/admin/tables/table-created': async () => response(409),
    'DELETE /api/admin/dishes/dish-created': async () => response(409),
    'DELETE /api/admin/categories/category-created': async () => response(409),
  });

  await assert.rejects(runAdminSmoke({
    env: baseEnv({ ADMIN_SMOKE_PREFIX: 'cleanup-all', ADMIN_SMOKE_READONLY_TABLE_ID: undefined }),
    fetchImpl,
    sleep: async () => {},
    logger: { log() {}, error() {} },
  }), /cleanup failed/i);
  assert.deepEqual(calls.filter(({ method }) => method === 'DELETE').map(({ pathname }) => pathname), [
    '/api/admin/tables/table-created',
    '/api/admin/dishes/dish-created',
    '/api/admin/categories/category-created',
  ]);
});

test('missing environment errors and logs never expose secrets', async () => {
  const { runAdminSmoke } = require(smokePath);
  const logs = [];
  await assert.rejects(
    runAdminSmoke({
      env: { ADMIN_SMOKE_PASSWORD: 'do-not-print-me' },
      fetchImpl: async () => { throw new Error('cookie=do-not-print-me'); },
      logger: { log: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' ')) },
    }),
    (error) => {
      assert.match(error.message, /missing required environment/i);
      assert.doesNotMatch(error.message, /do-not-print-me/);
      return true;
    },
  );
  assert.doesNotMatch(logs.join(' '), /do-not-print-me|cookie/i);
});
