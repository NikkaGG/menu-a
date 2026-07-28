const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

function load(relativePath) {
  return require(`../server/${relativePath}`);
}

function sharedLoginAttemptsQuery(state = new Map()) {
  const calls = [];
  const query = async (text, values = []) => {
    calls.push({ text, values });
    if (/^WITH expired_attempts/i.test(text.trim())) {
      const [now] = values;
      for (const [key, attempt] of state) {
        if (attempt.expiresAt <= now) state.delete(key);
      }
      return [];
    }
    const [key, now] = values;
    if (/^SELECT\s+GREATEST/i.test(text.trim())) {
      const attempt = state.get(key);
      if (!attempt || attempt.expiresAt <= now) return [];
      return [{
        retry_after: Math.max(1, Math.ceil((attempt.expiresAt - now) / 1000)),
      }];
    }
    if (/^INSERT INTO admin_login_attempts/i.test(text.trim())) {
      const attempt = state.get(key);
      if (attempt && attempt.expiresAt > now && attempt.count >= 5) return [];
      const count = !attempt || attempt.expiresAt <= now ? 1 : attempt.count + 1;
      const expiresAt = !attempt || attempt.expiresAt <= now
        ? now + (15 * 60 * 1000)
        : attempt.expiresAt;
      state.set(key, { count, expiresAt });
      return [{ failure_count: count, window_expires_at: expiresAt }];
    }
    if (/^WITH reserved_attempt/i.test(text.trim())) {
      const attempt = state.get(key);
      if (!attempt || attempt.expiresAt !== now) return [];
      if (attempt.count === 1) state.delete(key);
      else state.set(key, { ...attempt, count: attempt.count - 1 });
      return [{ client_key: key }];
    }
    throw new Error(`Unexpected SQL: ${text}`);
  };
  return { calls, query, state };
}

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

test('admin password hashes are salted, versioned, and verified asynchronously', async () => {
  const { hashPassword, verifyPasswordHash } = load('api/_lib/admin-password.js');
  const first = await hashPassword('correct horse battery staple');
  const second = await hashPassword('correct horse battery staple');

  assert.match(first, /^scrypt\$v2\$131072\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPasswordHash('correct horse battery staple', first), true);
  assert.equal(await verifyPasswordHash('wrong password', first), false);
});

test('admin password verification rejects malformed or unsafe hashes', async () => {
  const { hashPassword, verifyPasswordHash } = load('api/_lib/admin-password.js');
  const hash = await hashPassword('valid password');
  const malformed = [
    '',
    hash.replace('scrypt$v2', 'scrypt$v1'),
    hash.replace('$131072$', '$16384$'),
    `${hash}junk`,
    hash.replace(/\$[^$]+$/, '$not_base64!'),
  ];
  for (const value of malformed) {
    assert.equal(await verifyPasswordHash('valid password', value), false);
  }
  assert.equal(await verifyPasswordHash('', hash), false);
  assert.equal(await verifyPasswordHash('x'.repeat(1025), hash), false);
});

test('admin password hash CLI reads stdin and prints a verifiable hash', async () => {
  const { verifyPasswordHash } = load('api/_lib/admin-password.js');
  const script = path.join(__dirname, '..', 'scripts', 'hash-admin-password.js');
  const result = spawnSync(process.execPath, [script], {
    input: 'cli secret\n',
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(await verifyPasswordHash('cli secret', result.stdout.trim()), true);
});

test('admin sessions are purpose-bound, signed, expiring, and tamper resistant', () => {
  const {
    createAdminSessionToken,
    verifyAdminSessionToken,
  } = load('api/_lib/admin-auth.js');
  const now = 1_700_000_000_000;
  const secret = 'admin-only-session-secret-with-enough-entropy';
  const token = createAdminSessionToken(secret, now);
  const [payload, signature] = token.split('.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));

  assert.deepEqual(decoded, {
    purpose: 'admin',
    version: 1,
    exp: Math.floor(now / 1000) + (12 * 60 * 60),
  });
  assert.equal(verifyAdminSessionToken(token, secret, now), true);
  assert.equal(verifyAdminSessionToken(`${payload}.${signature.slice(0, -1)}x`, secret, now), false);
  assert.equal(verifyAdminSessionToken(token, `${secret}-wrong`, now), false);
  assert.equal(verifyAdminSessionToken(token, secret, now + (12 * 60 * 60 * 1000)), false);
  assert.equal(verifyAdminSessionToken('malformed', secret, now), false);
});

test('admin cookie flags are strict and production cookies are secure', () => {
  const {
    createAdminSessionCookie,
    createExpiredAdminSessionCookie,
    readAdminSessionCookie,
  } = load('api/_lib/admin-auth.js');

  assert.equal(
    createAdminSessionCookie('token', false),
    'admin_session=token; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200',
  );
  assert.equal(
    createAdminSessionCookie('token', true),
    'admin_session=token; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200',
  );
  assert.equal(
    createExpiredAdminSessionCookie(true),
    'admin_session=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
  );
  assert.equal(readAdminSessionCookie('other=x; admin_session=abc.def'), 'abc.def');
  assert.equal(readAdminSessionCookie('admin_session='), null);
});

test('admin login validates exact credentials and issues a session', async () => {
  const { hashPassword } = load('api/_lib/admin-password.js');
  const { createAdminLoginHandler } = load('api/admin/login.js');
  const env = {
    ADMIN_LOGIN: 'manager',
    ADMIN_PASSWORD_HASH: await hashPassword('very secret password'),
    ADMIN_SESSION_SECRET: 'admin-only-session-secret-with-enough-entropy',
    NODE_ENV: 'test',
  };
  const database = sharedLoginAttemptsQuery();
  const handler = createAdminLoginHandler({
    env,
    now: () => 1_700_000_000_000,
    query: database.query,
  });
  const headers = { 'x-vercel-forwarded-for': '203.0.113.8' };

  for (const body of [
    { login: 'manager', password: 'wrong' },
    { login: 'wrong', password: 'very secret password' },
    { login: 'manager', password: 'very secret password', extra: true },
    { login: 'manager' },
  ]) {
    const denied = await invoke(handler, { method: 'POST', body, headers });
    assert.equal(denied.statusCode, 401);
    assert.deepEqual(denied.body, { error: 'Unable to sign in' });
    assert.equal(denied.headers['set-cookie'], undefined);
  }

  const response = await invoke(handler, {
    method: 'POST',
    body: { login: 'manager', password: 'very secret password' },
    headers,
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { ok: true });
  assert.match(response.headers['set-cookie'], /^admin_session=[^.]+\.[^;]+; HttpOnly; SameSite=Strict; Path=\/; Max-Age=43200$/);
  assert.equal(database.state.size, 1);
  assert.equal([...database.state.values()][0].count, 4);
});

test('separate admin login handlers share atomic PostgreSQL failure state without storing raw IPs', async () => {
  const { createAdminLoginHandler } = load('api/admin/login.js');
  const env = {
    ADMIN_LOGIN: 'manager',
    ADMIN_PASSWORD_HASH: 'scrypt$v2$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    ADMIN_SESSION_SECRET: 'admin-only-session-secret-with-enough-entropy',
  };
  const database = sharedLoginAttemptsQuery();
  const options = {
    env,
    now: () => 1_700_000_000_000,
    query: database.query,
    verifyPassword: async () => false,
  };
  const firstInstance = createAdminLoginHandler(options);
  const secondInstance = createAdminLoginHandler(options);
  const headers = { 'x-vercel-forwarded-for': '203.0.113.9' };

  for (let count = 0; count < 5; count += 1) {
    const response = await invoke(count % 2 ? firstInstance : secondInstance, {
      method: 'POST',
      body: { login: 'manager', password: 'wrong' },
      headers,
    });
    assert.equal(response.statusCode, 401);
  }
  const blocked = await invoke(secondInstance, {
    method: 'POST',
    body: { login: 'manager', password: 'wrong' },
    headers,
  });
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers['retry-after'], '900');
  assert.equal(database.state.size, 1);

  const [storedKey] = database.state.keys();
  assert.match(storedKey, /^[a-f0-9]{64}$/);
  assert.notEqual(storedKey, '203.0.113.9');
  assert.equal(database.calls.some(({ text }) => /analytics_events/i.test(text)), false);
  for (const { text, values } of database.calls) {
    if (/^WITH expired_attempts/i.test(text.trim())) {
      assert.deepEqual(values, [1_700_000_000_000]);
      continue;
    }
    assert.equal(values.includes('203.0.113.9'), false);
    assert.equal(values[0], storedKey);
  }
});

test('admin login releases only its successful reservation', async () => {
  const { createAdminLoginHandler } = load('api/admin/login.js');
  const env = {
    ADMIN_LOGIN: 'manager',
    ADMIN_PASSWORD_HASH: 'scrypt$v2$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    ADMIN_SESSION_SECRET: 'admin-only-session-secret-with-enough-entropy',
  };
  const database = sharedLoginAttemptsQuery();
  const headers = { 'x-vercel-forwarded-for': '198.51.100.7' };
  const failing = createAdminLoginHandler({
    env,
    query: database.query,
    verifyPassword: async () => false,
  });
  const succeeding = createAdminLoginHandler({
    env,
    query: database.query,
    verifyPassword: async () => true,
  });

  assert.equal((await invoke(failing, {
    method: 'POST', body: { login: 'manager', password: 'wrong' }, headers,
  })).statusCode, 401);
  assert.equal(database.state.size, 1);
  assert.equal((await invoke(succeeding, {
    method: 'POST', body: { login: 'manager', password: 'right' }, headers,
  })).statusCode, 200);
  assert.equal(database.state.size, 1);
  assert.equal([...database.state.values()][0].count, 1);
});

test('admin login opportunistically purges expired attempts for unrelated clients', async () => {
  const { createAdminLoginHandler } = load('api/admin/login.js');
  const now = 1_700_000_000_000;
  const database = sharedLoginAttemptsQuery(new Map([
    ['expired-client', { count: 5, expiresAt: now - 1 }],
    ['active-client', { count: 2, expiresAt: now + 900000 }],
  ]));
  const handler = createAdminLoginHandler({
    env: {
      ADMIN_LOGIN: 'manager',
      ADMIN_PASSWORD_HASH: 'scrypt$v2$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      ADMIN_SESSION_SECRET: 'admin-only-session-secret-with-enough-entropy',
    },
    now: () => now,
    query: database.query,
    verifyPassword: async () => true,
  });

  const response = await invoke(handler, {
    method: 'POST',
    body: { login: 'manager', password: 'right' },
    headers: { 'x-vercel-forwarded-for': '198.51.100.9' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(database.state.has('expired-client'), false);
  assert.equal(database.state.has('active-client'), true);
  const cleanup = database.calls.find(({ text }) => /^WITH expired_attempts/i.test(text.trim()));
  assert.ok(cleanup);
  assert.match(cleanup.text, /ORDER BY expires_at\s+LIMIT 100/i);
  assert.equal((cleanup.text.match(/expires_at <=/gi) || []).length, 2);
});

test('admin login admits at most five password verifications per client window', async () => {
  const { createAdminLoginHandler } = load('api/admin/login.js');
  const now = 1_700_000_000_000;
  const database = sharedLoginAttemptsQuery();
  let verifyCalls = 0;
  let finishVerifications;
  const verificationGate = new Promise((resolve) => { finishVerifications = resolve; });
  const handler = createAdminLoginHandler({
    env: {
      ADMIN_LOGIN: 'manager',
      ADMIN_PASSWORD_HASH: 'scrypt$v2$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      ADMIN_SESSION_SECRET: 'admin-only-session-secret-with-enough-entropy',
    },
    now: () => now,
    query: database.query,
    verifyPassword: async () => {
      verifyCalls += 1;
      await verificationGate;
      return false;
    },
  });
  const requests = Array.from({ length: 10 }, () => invoke(handler, {
    method: 'POST',
    body: { login: 'manager', password: 'wrong' },
    headers: { 'x-vercel-forwarded-for': '198.51.100.8' },
  }));

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(verifyCalls, 5);
  finishVerifications();
  const responses = await Promise.all(requests);

  assert.equal(responses.filter(({ statusCode }) => statusCode === 401).length, 5);
  assert.equal(responses.filter(({ statusCode }) => statusCode === 429).length, 5);
  assert.equal(database.state.size, 1);
  assert.equal([...database.state.values()][0].count, 5);
});

test('successful admin login preserves a concurrent failed reservation', async () => {
  const { createAdminLoginHandler } = load('api/admin/login.js');
  const now = 1_700_000_000_000;
  const database = sharedLoginAttemptsQuery();
  let releaseSuccess;
  const successGate = new Promise((resolve) => { releaseSuccess = resolve; });
  const env = {
    ADMIN_LOGIN: 'manager',
    ADMIN_PASSWORD_HASH: 'scrypt$v2$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    ADMIN_SESSION_SECRET: 'admin-only-session-secret-with-enough-entropy',
  };
  const succeeding = createAdminLoginHandler({
    env,
    now: () => now,
    query: database.query,
    verifyPassword: async () => {
      await successGate;
      return true;
    },
  });
  const failing = createAdminLoginHandler({
    env,
    now: () => now,
    query: database.query,
    verifyPassword: async () => false,
  });
  const request = {
    method: 'POST',
    body: { login: 'manager', password: 'right' },
    headers: { 'x-vercel-forwarded-for': '198.51.100.12' },
  };

  const successfulResponse = invoke(succeeding, request);
  await new Promise((resolve) => setImmediate(resolve));
  const failedResponse = await invoke(failing, {
    ...request,
    body: { login: 'manager', password: 'wrong' },
  });
  releaseSuccess();
  const response = await successfulResponse;

  assert.equal(failedResponse.statusCode, 401);
  assert.equal(response.statusCode, 200);
  assert.equal(database.state.size, 1);
  assert.equal([...database.state.values()][0].count, 1);
});

test('admin login fails closed when expired-attempt cleanup is unavailable', async () => {
  const { createAdminLoginHandler } = load('api/admin/login.js');
  const handler = createAdminLoginHandler({
    env: {
      ADMIN_LOGIN: 'manager',
      ADMIN_PASSWORD_HASH: 'scrypt$v2$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      ADMIN_SESSION_SECRET: 'admin-only-session-secret-with-enough-entropy',
    },
    query: async (text) => {
      if (/^WITH expired_attempts/i.test(text.trim())) throw new Error('database unavailable');
      return [];
    },
    verifyPassword: async () => true,
  });

  const response = await invoke(handler, {
    method: 'POST',
    body: { login: 'manager', password: 'right' },
    headers: { 'x-vercel-forwarded-for': '198.51.100.10' },
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, { error: 'Unable to sign in' });
  assert.equal(response.headers['set-cookie'], undefined);
});

test('admin login fails closed for invalid configuration and database failures', async () => {
  const { createAdminLoginHandler } = load('api/admin/login.js');
  const invalid = createAdminLoginHandler({ env: {}, query: async () => [] });
  const request = {
    method: 'POST',
    body: { login: 'manager', password: 'secret' },
    headers: { 'x-vercel-forwarded-for': '203.0.113.10' },
  };
  const invalidResponse = await invoke(invalid, request);
  assert.equal(invalidResponse.statusCode, 503);
  assert.deepEqual(invalidResponse.body, { error: 'Unable to sign in' });

  const unavailable = createAdminLoginHandler({
    env: {
      ADMIN_LOGIN: 'manager',
      ADMIN_PASSWORD_HASH: 'scrypt$v2$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      ADMIN_SESSION_SECRET: 'admin-only-session-secret-with-enough-entropy',
    },
    query: async () => {
      throw new Error('database unavailable');
    },
  });
  const unavailableResponse = await invoke(unavailable, request);
  assert.equal(unavailableResponse.statusCode, 503);
  assert.deepEqual(unavailableResponse.body, { error: 'Unable to sign in' });
  assert.equal(unavailableResponse.headers['set-cookie'], undefined);
});

test('successful production admin login issues a Secure cookie', async () => {
  const { createAdminLoginHandler } = load('api/admin/login.js');
  const database = sharedLoginAttemptsQuery();
  const handler = createAdminLoginHandler({
    env: {
      ADMIN_LOGIN: 'manager',
      ADMIN_PASSWORD_HASH: 'scrypt$v2$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      ADMIN_SESSION_SECRET: 'admin-only-session-secret-with-enough-entropy',
      NODE_ENV: 'production',
    },
    query: database.query,
    verifyPassword: async () => true,
  });
  const response = await invoke(handler, {
    method: 'POST',
    body: { login: 'manager', password: 'secret' },
    headers: { 'x-vercel-forwarded-for': '203.0.113.11' },
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['set-cookie'], /; Secure; HttpOnly;/);
});

test('admin session reports valid authentication and rejects invalid cookies', async () => {
  const { createAdminSessionToken } = load('api/_lib/admin-auth.js');
  const { createAdminSessionHandler } = load('api/admin/session.js');
  const now = 1_700_000_000_000;
  const secret = 'admin-only-session-secret-with-enough-entropy';
  const handler = createAdminSessionHandler({
    env: { ADMIN_SESSION_SECRET: secret },
    now: () => now,
  });
  const token = createAdminSessionToken(secret, now);

  const valid = await invoke(handler, {
    method: 'GET',
    headers: { cookie: `admin_session=${token}` },
  });
  assert.equal(valid.statusCode, 200);
  assert.deepEqual(valid.body, { authenticated: true });

  for (const headers of [{}, { cookie: 'admin_session=bad' }]) {
    const denied = await invoke(handler, { method: 'GET', headers });
    assert.equal(denied.statusCode, 401);
    assert.deepEqual(denied.body, { error: 'Unauthorized' });
  }
});

test('admin logout expires the admin cookie and all auth routes restrict methods', async () => {
  const login = load('api/admin/login.js');
  const session = load('api/admin/session.js');
  const logout = load('api/admin/logout.js');
  for (const route of [login, session, logout]) assert.equal(typeof route, 'function');

  const response = await invoke(logout.createAdminLogoutHandler({
    env: { NODE_ENV: 'production' },
  }), { method: 'POST' });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['set-cookie'], /^admin_session=; Secure;.*Max-Age=0$/);

  const wrongMethods = [
    [login.createAdminLoginHandler({ env: {} }), 'GET'],
    [session.createAdminSessionHandler({ env: {} }), 'POST'],
    [logout.createAdminLogoutHandler({ env: {} }), 'GET'],
  ];
  for (const [handler, method] of wrongMethods) {
    const denied = await invoke(handler, { method, headers: {} });
    assert.equal(denied.statusCode, 405);
  }
});

test('real admin cookies authorize every category and dish route', async () => {
  const { createAdminSessionToken } = load('api/_lib/admin-auth.js');
  const secret = 'admin-only-session-secret-with-enough-entropy';
  const previous = process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_SESSION_SECRET = secret;
  const token = createAdminSessionToken(secret);
  const headers = { cookie: `admin_session=${token}` };
  const routes = [
    [load('api/admin/categories/index.js').createCategoriesHandler, { method: 'GET', headers }],
    [load('api/admin/categories/[id].js').createCategoryHandler, {
      method: 'DELETE', query: { id: '11111111-1111-4111-8111-111111111111' }, headers,
    }],
    [load('api/admin/dishes/index.js').createDishesHandler, { method: 'GET', headers }],
    [load('api/admin/dishes/[id].js').createDishHandler, {
      method: 'DELETE', query: { id: '22222222-2222-4222-8222-222222222222' }, headers,
    }],
  ];
  try {
    for (const [factory, request] of routes) {
      let calls = 0;
      const response = await invoke(factory({
        query: async () => {
          calls += 1;
          return [];
        },
      }), request);
      assert.notEqual(response.statusCode, 401);
      assert.equal(calls, 1);
    }
  } finally {
    if (previous === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = previous;
  }
});
