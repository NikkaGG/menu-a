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

function mutationEnv(prefix = 'branch-42', overrides = {}) {
  return baseEnv({
    ADMIN_SMOKE_MODE: 'preview-mutation',
    ADMIN_SMOKE_ENVIRONMENT: 'preview',
    ADMIN_SMOKE_MUTATION_CONFIRM: 'preview-only',
    ADMIN_SMOKE_PREFIX: prefix,
    ADMIN_SMOKE_EXPECTED_PREVIEW_ORIGIN: 'https://preview.example.test',
    ADMIN_SMOKE_PRODUCTION_ORIGIN: 'https://production.example.test',
    ADMIN_SMOKE_READONLY_TABLE_ID: undefined,
    ...overrides,
  });
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
    if (['/admin', '/admin/menu', '/admin/tables', '/stats'].includes(pathname)) {
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

test('read-only production mode verifies only canonical shells, assets, APIs, and QR without mutations', async () => {
  const { runAdminSmoke } = require(smokePath);
  const calls = [];
  const result = await runAdminSmoke({ env: baseEnv(), fetchImpl: successfulFetch(calls), logger: { log() {}, error() {} } });

  assert.equal(result.mode, 'readonly');
  assert.deepEqual(calls.filter(({ method }) => ['POST', 'PATCH', 'DELETE'].includes(method)).map(({ pathname, method }) => [method, pathname]), [
    ['POST', '/api/admin/login'],
    ['POST', '/api/admin/logout'],
  ]);
  for (const route of ['/admin', '/admin/menu', '/admin/tables', '/stats']) {
    assert.ok(calls.some(({ pathname }) => pathname === route), route);
  }
  assert.ok(calls.every(({ pathname }) => !pathname.startsWith('/admin-next')));
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
    env: mutationEnv(),
    fetchImpl,
    logger: { log() {}, error() {} },
    now: () => 123,
    random: () => 0.5,
  });

  assert.deepEqual(result, { mode: 'preview', tableId: 'table-created' });
  assert.deepEqual(
    calls.filter(({ pathname }) => ['/admin', '/admin/menu', '/admin/tables', '/stats'].includes(pathname))
      .map(({ pathname }) => pathname),
    ['/admin', '/admin/menu', '/admin/tables', '/stats'],
  );
  assert.ok(calls.every(({ pathname }) => !pathname.startsWith('/admin-next')));
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
    runAdminSmoke({ env: mutationEnv('partial'), fetchImpl, sleep: async () => {}, logger: { log() {}, error() {} } }),
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

test('cleanup retry status boundaries are exactly 500 through 599', async () => {
  const { cleanupResource } = require(smokePath);
  for (const [status, expectedAttempts] of [[499, 1], [500, 4], [599, 4], [600, 1]]) {
    let attempts = 0;
    await assert.rejects(cleanupResource({
      path: '/resource',
      request: async () => { attempts += 1; return { ok: false, status }; },
      sleep: async () => {},
    }), /cleanup failed/i);
    assert.equal(attempts, expectedAttempts, `HTTP ${status}`);
  }
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
    env: mutationEnv('cleanup-all'),
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

test('default and explicit read-only modes ignore a mutation prefix and never mutate business data', async () => {
  const { runAdminSmoke } = require(smokePath);
  for (const mode of [undefined, 'readonly']) {
    const calls = [];
    const result = await runAdminSmoke({
      env: baseEnv({ ADMIN_SMOKE_MODE: mode, ADMIN_SMOKE_PREFIX: 'must-be-ignored' }),
      fetchImpl: successfulFetch(calls),
      logger: { log() {}, error() {} },
    });

    assert.equal(result.mode, 'readonly');
    assert.deepEqual(
      calls.filter(({ method, pathname }) => ['POST', 'PATCH', 'DELETE'].includes(method)
        && !['/api/admin/login', '/api/admin/logout'].includes(pathname)),
      [],
    );
  }
});

test('preview mutation requires every explicit preview-only confirmation', async () => {
  const { runAdminSmoke } = require(smokePath);
  for (const env of [
    mutationEnv('unsafe', { ADMIN_SMOKE_ENVIRONMENT: undefined }),
    mutationEnv('unsafe', { ADMIN_SMOKE_MUTATION_CONFIRM: undefined }),
    mutationEnv('unsafe', { ADMIN_SMOKE_PREFIX: undefined }),
    mutationEnv('unsafe', { ADMIN_SMOKE_ENVIRONMENT: 'production' }),
  ]) {
    const calls = [];
    await assert.rejects(
      runAdminSmoke({ env, fetchImpl: async (...args) => { calls.push(args); throw new Error('must not fetch'); } }),
      /preview mutation|missing required environment/i,
    );
    assert.equal(calls.length, 0);
  }
});

test('production configuration can neither create nor clean up resources', async () => {
  const { runAdminSmoke } = require(smokePath);
  const calls = [];
  await assert.rejects(runAdminSmoke({
    env: mutationEnv('production-danger', { ADMIN_SMOKE_ENVIRONMENT: 'production' }),
    fetchImpl: async (url, init = {}) => {
      calls.push({ pathname: new URL(url).pathname, method: init.method || 'GET' });
      return response(500);
    },
    sleep: async () => {},
  }), /preview mutation/i);
  assert.deepEqual(calls.filter(({ method }) => ['POST', 'PATCH', 'DELETE'].includes(method)), []);
});

test('production origin is rejected even with every preview mutation flag', async () => {
  const { runAdminSmoke } = require(smokePath);
  const calls = [];
  await assert.rejects(runAdminSmoke({
    env: mutationEnv('production-origin', {
      ADMIN_SMOKE_BASE_URL: 'https://production.example.test/',
      ADMIN_SMOKE_EXPECTED_PREVIEW_ORIGIN: 'https://production.example.test',
      ADMIN_SMOKE_PRODUCTION_ORIGIN: 'https://production.example.test',
    }),
    fetchImpl: async (...args) => {
      calls.push(args);
      return response(500);
    },
  }), /production origin/i);
  assert.equal(calls.length, 0);
});

test('preview mutation rejects a mismatched expected preview origin', async () => {
  const { runAdminSmoke } = require(smokePath);
  const calls = [];
  await assert.rejects(runAdminSmoke({
    env: mutationEnv('wrong-origin', {
      ADMIN_SMOKE_EXPECTED_PREVIEW_ORIGIN: 'https://different-preview.example.test',
    }),
    fetchImpl: async (...args) => {
      calls.push(args);
      return response(500);
    },
  }), /expected preview origin/i);
  assert.equal(calls.length, 0);
});

test('valid distinct preview and production origins allow mutation mode', () => {
  const { requiredEnvironment } = require(smokePath);
  const config = requiredEnvironment(mutationEnv());
  assert.equal(config.baseUrl, 'https://preview.example.test/');
  assert.equal(config.mode, 'preview-mutation');
});

test('preview and production origins are both validated as strict origins', () => {
  const { requiredEnvironment } = require(smokePath);
  for (const overrides of [
    { ADMIN_SMOKE_EXPECTED_PREVIEW_ORIGIN: 'https://preview.example.test/path' },
    { ADMIN_SMOKE_PRODUCTION_ORIGIN: 'https://production.example.test/?query=unsafe' },
    { ADMIN_SMOKE_PRODUCTION_ORIGIN: 'http://production.example.test' },
  ]) {
    assert.throws(() => requiredEnvironment(mutationEnv('strict-origin', overrides)), /origin|HTTPS/i);
  }
});

test('long prefixes retain bounded unique suffixes and concurrent runs differ', () => {
  const { uniqueResourceNames } = require(smokePath);
  const prefix = 'x'.repeat(120);
  const first = uniqueResourceNames(prefix, 1700000000000, 0.1);
  const second = uniqueResourceNames(prefix, 1700000000000, 0.2);

  assert.notDeepEqual(first, second);
  assert.match(first.category, /1700000000000/);
  assert.match(first.dish, /1700000000000/);
  assert.match(first.table, /1700000000000/);
  assert.ok(first.category.length <= 200);
  assert.ok(first.dish.length <= 200);
  assert.ok(first.table.length <= 100);
  assert.notEqual(first.category.slice(-20), second.category.slice(-20));
});

test('base URL rejects credentials, query, fragment, and non-root paths', () => {
  const { requiredEnvironment } = require(smokePath);
  for (const baseUrl of [
    'https://user:password@example.test/',
    'https://example.test/?token=secret',
    'https://example.test/#fragment',
    'https://example.test/deployment',
  ]) {
    assert.throws(
      () => requiredEnvironment(baseEnv({ ADMIN_SMOKE_BASE_URL: baseUrl })),
      /origin URL.*root path|valid HTTP/i,
      baseUrl,
    );
  }
  assert.equal(requiredEnvironment(baseEnv({ ADMIN_SMOKE_BASE_URL: 'https://example.test/' })).baseUrl, 'https://example.test/');
});

test('HTTP is rejected remotely and accepted only for loopback hosts', () => {
  const { requiredEnvironment } = require(smokePath);
  assert.throws(
    () => requiredEnvironment(baseEnv({ ADMIN_SMOKE_BASE_URL: 'http://preview.example.test/' })),
    /HTTPS|loopback/i,
  );
  for (const baseUrl of [
    'http://localhost:3000/',
    'http://127.0.0.1:3000/',
    'http://[::1]:3000/',
  ]) {
    assert.equal(requiredEnvironment(baseEnv({ ADMIN_SMOKE_BASE_URL: baseUrl })).baseUrl, baseUrl);
  }
});

test('requests resolve endpoints from the validated base URL', async () => {
  const { runAdminSmoke } = require(smokePath);
  const urls = [];
  await runAdminSmoke({
    env: baseEnv({ ADMIN_SMOKE_BASE_URL: 'https://example.test/' }),
    fetchImpl: async (url, init) => {
      urls.push(url);
      return successfulFetch([])(url, init);
    },
    logger: { log() {}, error() {} },
  });
  assert.ok(urls.length > 0);
  assert.ok(urls.every((url) => new URL(url).origin === 'https://example.test'));
  assert.ok(urls.some((url) => new URL(url).pathname === '/api/admin/session'));
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
