const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function load(relativePath) {
  return require(`../server/${relativePath}`);
}

function responseHarness() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
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

const visitorId = '11111111-1111-4111-8111-111111111111';
const orderId = '22222222-2222-4222-8222-222222222222';

function eventHeaders(body, ip, extra = {}) {
  return {
    'content-length': String(Buffer.byteLength(JSON.stringify(body))),
    'x-vercel-forwarded-for': ip,
    ...extra,
  };
}

test('event validation accepts each exact event contract', () => {
  const { validateEvent } = load('api/events.js');
  const events = [
    { eventType: 'visit', visitorId, deviceClass: 'mobile', browserFamily: 'chrome' },
    {
      eventType: 'product_view',
      visitorId,
      product: { id: 1, name: 'Филадельфия', category: 'Роллы' },
    },
    {
      eventType: 'add_to_cart',
      visitorId,
      product: { id: 1, name: 'Филадельфия', category: 'Роллы' },
      quantityAdded: 2,
      cartQuantity: 3,
    },
    {
      eventType: 'checkout_started',
      visitorId,
      deliveryMethod: 'delivery',
      paymentMethod: 'card',
    },
    {
      eventType: 'order_completed',
      visitorId,
      orderId,
      items: [{ id: 1, name: 'Филадельфия', category: 'Роллы', quantity: 2, unitPrice: 2500 }],
      total: 5000,
      deliveryMethod: 'pickup',
      paymentMethod: 'cash',
    },
  ];

  for (const event of events) {
    assert.deepEqual(validateEvent(event), event);
  }
});

test('event validation rejects unknown fields, invalid enums, UUIDs, and bounds', () => {
  const { validateEvent } = load('api/events.js');
  const validProduct = { id: 1, name: 'A', category: 'B' };
  const invalid = [
    { eventType: 'visit', visitorId: 'bad', deviceClass: 'mobile', browserFamily: 'chrome' },
    { eventType: 'visit', visitorId, deviceClass: 'watch', browserFamily: 'chrome' },
    { eventType: 'visit', visitorId, deviceClass: 'mobile', browserFamily: 'opera' },
    { eventType: 'product_view', visitorId, product: { ...validProduct, id: 0 } },
    { eventType: 'product_view', visitorId, product: { ...validProduct, name: 'x'.repeat(161) } },
    { eventType: 'product_view', visitorId, product: { ...validProduct, category: 'x'.repeat(81) } },
    { eventType: 'add_to_cart', visitorId, product: validProduct, quantityAdded: 0, cartQuantity: 1 },
    { eventType: 'add_to_cart', visitorId, product: validProduct, quantityAdded: 1, cartQuantity: 100 },
    { eventType: 'checkout_started', visitorId, deliveryMethod: 'courier' },
    { eventType: 'checkout_started', visitorId, deliveryMethod: 'delivery', paymentMethod: 'crypto' },
    { eventType: 'visit', visitorId, deviceClass: 'mobile', browserFamily: 'chrome', phone: 'secret' },
    { eventType: 'product_view', visitorId, product: { ...validProduct, extra: true } },
  ];

  for (const event of invalid) {
    assert.throws(() => validateEvent(event), /invalid/i);
  }
});

test('order validation enforces item count, integer prices, totals, and order UUID', () => {
  const { validateEvent } = load('api/events.js');
  const base = {
    eventType: 'order_completed',
    visitorId,
    orderId,
    items: [{ id: 1, name: 'A', category: 'B', quantity: 1, unitPrice: 100 }],
    total: 100,
    deliveryMethod: 'delivery',
    paymentMethod: 'kaspi_invoice',
  };

  assert.throws(() => validateEvent({ ...base, orderId: 'bad' }), /invalid/i);
  assert.throws(() => validateEvent({ ...base, items: [] }), /invalid/i);
  assert.throws(() => validateEvent({ ...base, items: Array(101).fill(base.items[0]) }), /invalid/i);
  assert.throws(() => validateEvent({ ...base, items: [{ ...base.items[0], quantity: 100 }] }), /invalid/i);
  assert.throws(() => validateEvent({ ...base, items: [{ ...base.items[0], unitPrice: 0 }] }), /invalid/i);
  assert.throws(() => validateEvent({ ...base, total: 99 }), /invalid/i);
  assert.throws(() => validateEvent({ ...base, total: 100, comment: 'private' }), /invalid/i);
});

test('session tokens are signed, expire after 12 hours, and cookies are hardened', () => {
  const { createSessionToken, verifySessionToken, createSessionCookie } = load('api/_lib/auth.js');
  const now = 1_700_000_000_000;
  const secret = 'a sufficiently long session secret';
  const token = createSessionToken(secret, now);

  assert.equal(verifySessionToken(token, secret, now + (12 * 60 * 60 * 1000) - 1), true);
  assert.equal(verifySessionToken(`${token.slice(0, -1)}x`, secret, now), false);
  assert.equal(verifySessionToken(token, secret, now + 12 * 60 * 60 * 1000), false);
  assert.match(createSessionCookie(token, false), /^stats_session=.*HttpOnly; SameSite=Strict; Path=\/; Max-Age=43200$/);
  assert.match(createSessionCookie(token, true), /; Secure;/);
});

test('constant-time password comparison handles unequal lengths', () => {
  const { safeEqual } = load('api/_lib/auth.js');
  assert.equal(safeEqual('correct horse', 'correct horse'), true);
  assert.equal(safeEqual('correct horse', 'wrong'), false);
});

test('stats days accepts only 7, 30, or 90 and defaults to 30', () => {
  const { parseDays } = load('api/stats/index.js');
  assert.equal(parseDays(undefined), 30);
  assert.equal(parseDays('7'), 7);
  assert.equal(parseDays('30'), 30);
  assert.equal(parseDays('90'), 90);
  for (const value of ['0', '8', '030', 'abc', ['30']]) {
    assert.throws(() => parseDays(value), /days/i);
  }
});

test('events route inserts anonymized values and acknowledges duplicate order IDs', async () => {
  const { createEventsHandler } = load('api/events.js');
  const calls = [];
  const query = async (text, values) => {
    calls.push({ text, values });
    return [];
  };
  const handler = createEventsHandler({ query, now: () => 0 });
  const event = {
    eventType: 'order_completed',
    visitorId,
    orderId,
    items: [{ id: 1, name: 'A', category: 'B', quantity: 1, unitPrice: 100 }],
    total: 100,
    deliveryMethod: 'delivery',
    paymentMethod: 'card',
  };
  const response = responseHarness();
  await handler({ method: 'POST', body: event, headers: eventHeaders(event, '203.0.113.1') }, response);

  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.body, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].values.includes('203.0.113.1'), false);
  assert.equal(calls[0].values.some((value) => typeof value === 'string' && value.includes('secret')), false);

  const duplicateHandler = createEventsHandler({
    query: async () => {
      const error = new Error('duplicate');
      error.code = '23505';
      throw error;
    },
    now: () => 0,
  });
  const duplicateResponse = responseHarness();
  await duplicateHandler({ method: 'POST', body: event, headers: eventHeaders(event, '203.0.113.2') }, duplicateResponse);
  assert.equal(duplicateResponse.statusCode, 202);
  assert.deepEqual(duplicateResponse.body, { ok: true });
});

test('events route enforces method, body size, and 30 request per minute IP limit', async () => {
  const { createEventsHandler } = load('api/events.js');
  const handler = createEventsHandler({ query: async () => [], now: () => 0 });
  const body = { eventType: 'visit', visitorId, deviceClass: 'desktop', browserFamily: 'other' };

  const wrongMethod = responseHarness();
  await handler({ method: 'GET', headers: {} }, wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);

  const oversized = responseHarness();
  await handler({
    method: 'POST',
    body,
    headers: { 'content-length': String((32 * 1024) + 1), 'x-vercel-forwarded-for': '198.51.100.1' },
  }, oversized);
  assert.equal(oversized.statusCode, 413);

  const parsedWithoutLength = responseHarness();
  await handler({
    method: 'POST',
    body: { ...body, padding: 'x'.repeat(33 * 1024) },
    headers: { 'x-vercel-forwarded-for': '198.51.100.3' },
  }, parsedWithoutLength);
  assert.equal(parsedWithoutLength.statusCode, 411);

  const oversizedRaw = responseHarness();
  await handler({
    method: 'POST',
    body,
    rawBody: `${' '.repeat(32 * 1024)}{}`,
    headers: { 'x-vercel-forwarded-for': '198.51.100.4' },
  }, oversizedRaw);
  assert.equal(oversizedRaw.statusCode, 413);

  const oversizedBuffer = responseHarness();
  await handler({
    method: 'POST',
    body: Buffer.alloc((32 * 1024) + 1),
    headers: { 'x-vercel-forwarded-for': '198.51.100.5' },
  }, oversizedBuffer);
  assert.equal(oversizedBuffer.statusCode, 413);

  const exactLimit = responseHarness();
  await handler({
    method: 'POST',
    body,
    rawBody: Buffer.alloc(32 * 1024),
    headers: {
      'content-length': String(32 * 1024),
      'x-vercel-forwarded-for': '198.51.100.6',
    },
  }, exactLimit);
  assert.equal(exactLimit.statusCode, 202);

  for (const contentLength of ['invalid', '-1', '1.5']) {
    const malformed = responseHarness();
    await handler({
      method: 'POST',
      body,
      headers: {
        'content-length': contentLength,
        'x-vercel-forwarded-for': `198.51.100.${10 + contentLength.length}`,
      },
    }, malformed);
    assert.equal(malformed.statusCode, 400);
  }

  for (let count = 0; count < 30; count += 1) {
    const response = responseHarness();
    await handler({ method: 'POST', body, headers: eventHeaders(body, '198.51.100.2') }, response);
    assert.equal(response.statusCode, 202);
  }
  const blocked = responseHarness();
  await handler({ method: 'POST', body, headers: eventHeaders(body, '198.51.100.2') }, blocked);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers['retry-after'], '60');
});

test('events route returns HTTP 400 for every invalid contract category', async () => {
  const { createEventsHandler } = load('api/events.js');
  const handler = createEventsHandler({ query: async () => [], now: () => 0 });
  const product = { id: 1, name: 'A', category: 'B' };
  const order = {
    eventType: 'order_completed',
    visitorId,
    orderId,
    items: [{ ...product, quantity: 1, unitPrice: 100 }],
    total: 100,
    deliveryMethod: 'delivery',
    paymentMethod: 'card',
  };
  const invalidEvents = [
    { eventType: 'visit', visitorId: 'bad', deviceClass: 'desktop', browserFamily: 'chrome' },
    { eventType: 'visit', visitorId, deviceClass: 'watch', browserFamily: 'chrome' },
    { eventType: 'visit', visitorId, deviceClass: 'desktop', browserFamily: 'opera' },
    { eventType: 'checkout_started', visitorId, deliveryMethod: 'courier', paymentMethod: 'card' },
    { eventType: 'checkout_started', visitorId, deliveryMethod: 'delivery', paymentMethod: 'crypto' },
    { eventType: 'product_view', visitorId, product: { ...product, id: 0 } },
    { eventType: 'product_view', visitorId, product: { ...product, name: 'x'.repeat(161) } },
    { eventType: 'product_view', visitorId, product: { ...product, category: 'x'.repeat(81) } },
    { eventType: 'product_view', visitorId, product: { ...product, nestedUnknown: true } },
    { eventType: 'add_to_cart', visitorId, product, quantityAdded: 0, cartQuantity: 1 },
    { eventType: 'add_to_cart', visitorId, product, quantityAdded: 1, cartQuantity: 100 },
    { eventType: 'add_to_cart', visitorId, product, quantityAdded: 1.5, cartQuantity: 2 },
    { ...order, orderId: 'bad' },
    { ...order, items: [] },
    { ...order, items: Array(101).fill(order.items[0]), total: 10100 },
    { ...order, items: [{ ...order.items[0], quantity: 100 }], total: 10000 },
    { ...order, items: [{ ...order.items[0], quantity: 1.5 }], total: 150 },
    { ...order, items: [{ ...order.items[0], unitPrice: 0 }], total: 0 },
    { ...order, items: [{ ...order.items[0], unitPrice: 1.5 }], total: 1.5 },
    { ...order, items: [{ ...order.items[0], unknown: true }] },
    { eventType: 'visit', visitorId, deviceClass: 'desktop', browserFamily: 'chrome', unknown: true },
    { ...order, total: 99 },
  ];

  for (const [index, body] of invalidEvents.entries()) {
    const response = responseHarness();
    await handler({
      method: 'POST',
      body,
      headers: eventHeaders(body, `192.0.2.${index + 1}`),
    }, response);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: 'Invalid event' });
  }
});

test('events route accepts all five valid event types', async () => {
  const { createEventsHandler } = load('api/events.js');
  const inserted = [];
  const handler = createEventsHandler({
    query: async (text, values) => inserted.push({ text, values }),
    now: () => 0,
  });
  const product = { id: 1, name: 'A', category: 'B' };
  const events = [
    { eventType: 'visit', visitorId, deviceClass: 'desktop', browserFamily: 'chrome' },
    { eventType: 'product_view', visitorId, product },
    { eventType: 'add_to_cart', visitorId, product, quantityAdded: 1, cartQuantity: 2 },
    { eventType: 'checkout_started', visitorId, deliveryMethod: 'pickup', paymentMethod: 'cash' },
    {
      eventType: 'order_completed',
      visitorId,
      orderId,
      items: [{ ...product, quantity: 2, unitPrice: 100 }],
      total: 200,
      deliveryMethod: 'delivery',
      paymentMethod: 'card',
    },
  ];

  for (const [index, body] of events.entries()) {
    const response = responseHarness();
    await handler({
      method: 'POST',
      body,
      headers: eventHeaders(body, `203.0.113.${100 + index}`),
    }, response);
    assert.equal(response.statusCode, 202);
    assert.deepEqual(response.body, { ok: true });
  }
  assert.equal(inserted.length, 5);
});

test('duplicate same-day visits use the targeted database conflict rule and remain successful', async () => {
  const { createEventsHandler } = load('api/events.js');
  const calls = [];
  const handler = createEventsHandler({
    query: async (text, values) => calls.push({ text, values }),
    now: () => 0,
  });
  const body = { eventType: 'visit', visitorId, deviceClass: 'mobile', browserFamily: 'safari' };

  for (const ip of ['203.0.113.210', '203.0.113.211']) {
    const response = responseHarness();
    await handler({ method: 'POST', body, headers: eventHeaders(body, ip) }, response);
    assert.equal(response.statusCode, 202);
    assert.deepEqual(response.body, { ok: true });
  }
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.match(
      call.text,
      /ON CONFLICT \(visitor_id, restaurant_date\) WHERE event_type = 'visit' DO NOTHING/i,
    );
  }
});

test('events limiter prunes expired IPs and fails closed at its state cap', async () => {
  const { createEventsHandler } = load('api/events.js');
  const body = { eventType: 'visit', visitorId, deviceClass: 'desktop', browserFamily: 'other' };
  const store = new Map([['expired', [-60001]], ['active', [0]]]);
  const handler = createEventsHandler({
    query: async () => [],
    now: () => 0,
    rateLimitStore: store,
    maxRateLimitEntries: 2,
  });
  const response = responseHarness();
  await handler({
    method: 'POST',
    body,
    headers: eventHeaders(body, '203.0.113.212'),
  }, response);
  assert.equal(response.statusCode, 202);
  assert.equal(store.has('expired'), false);
  assert.equal(store.size, 2);

  const blocked = responseHarness();
  await handler({
    method: 'POST',
    body,
    headers: eventHeaders(body, '203.0.113.213'),
  }, blocked);
  assert.equal(blocked.statusCode, 429);
  assert.equal(store.size, 2);
});

test('route modules expose handlers directly for Vercel', () => {
  for (const route of ['api/events.js', 'api/stats/login.js', 'api/stats/logout.js', 'api/stats/index.js']) {
    assert.equal(typeof load(route), 'function');
  }
});

test('login allows five failures, blocks sixth, and success resets failures', async () => {
  const { createLoginHandler } = load('api/stats/login.js');
  const env = { STATS_PASSWORD: 'owner-password', STATS_SESSION_SECRET: 'a sufficiently long session secret', NODE_ENV: 'test' };
  const handler = createLoginHandler({ env, now: () => 0 });
  const headers = { 'x-vercel-forwarded-for': '203.0.113.20' };

  for (let count = 0; count < 5; count += 1) {
    const response = responseHarness();
    await handler({ method: 'POST', body: { password: 'wrong' }, headers }, response);
    assert.equal(response.statusCode, 401);
  }
  const blocked = responseHarness();
  await handler({ method: 'POST', body: { password: 'wrong' }, headers }, blocked);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers['retry-after'], '900');

  const otherIp = { 'x-vercel-forwarded-for': '203.0.113.21' };
  const failed = responseHarness();
  await handler({ method: 'POST', body: { password: 'wrong' }, headers: otherIp }, failed);
  const success = responseHarness();
  await handler({ method: 'POST', body: { password: 'owner-password' }, headers: otherIp }, success);
  assert.equal(success.statusCode, 200);
  assert.match(success.headers['set-cookie'], /HttpOnly/);
  for (let count = 0; count < 5; count += 1) {
    const response = responseHarness();
    await handler({ method: 'POST', body: { password: 'wrong' }, headers: otherIp }, response);
    assert.equal(response.statusCode, 401);
  }
});

test('login failures persist when the production handler factory is recreated', async () => {
  const { createLoginHandler } = load('api/stats/login.js');
  const env = {
    STATS_PASSWORD: 'owner-password',
    STATS_SESSION_SECRET: 'a sufficiently long session secret',
    NODE_ENV: 'test',
  };
  const headers = { 'x-vercel-forwarded-for': '203.0.113.99' };
  for (let count = 0; count < 5; count += 1) {
    const response = responseHarness();
    await createLoginHandler({ env, now: () => 0 })(
      { method: 'POST', body: { password: 'wrong' }, headers },
      response,
    );
    assert.equal(response.statusCode, 401);
  }
  const blocked = responseHarness();
  await createLoginHandler({ env, now: () => 0 })(
    { method: 'POST', body: { password: 'wrong' }, headers },
    blocked,
  );
  assert.equal(blocked.statusCode, 429);
});

test('login limiter prunes expired IPs and fails closed at its state cap', async () => {
  const { createLoginHandler } = load('api/stats/login.js');
  const env = {
    STATS_PASSWORD: 'owner-password',
    STATS_SESSION_SECRET: 'a sufficiently long session secret',
    NODE_ENV: 'test',
  };
  const failures = new Map([
    ['expired', { count: 5, lastFailure: 0 }],
    ['active', { count: 1, lastFailure: 900001 }],
  ]);
  const handler = createLoginHandler({
    env,
    now: () => 900001,
    failures,
    maxFailureEntries: 2,
  });
  const failed = responseHarness();
  await handler({
    method: 'POST',
    body: { password: 'wrong' },
    headers: { 'x-vercel-forwarded-for': '203.0.113.214' },
  }, failed);
  assert.equal(failed.statusCode, 401);
  assert.equal(failures.has('expired'), false);
  assert.equal(failures.size, 2);

  const capped = responseHarness();
  await handler({
    method: 'POST',
    body: { password: 'wrong' },
    headers: { 'x-vercel-forwarded-for': '203.0.113.215' },
  }, capped);
  assert.equal(capped.statusCode, 429);
  assert.equal(capped.headers['retry-after'], '900');
  assert.equal(failures.size, 2);
});

test('logout expires only the browser cookie', async () => {
  const { createSessionToken, verifySessionToken } = load('api/_lib/auth.js');
  const { logoutHandler } = load('api/stats/logout.js');
  const now = 1_700_000_000_000;
  const secret = 'a sufficiently long session secret';
  const token = createSessionToken(secret, now);
  const response = responseHarness();

  await logoutHandler({ method: 'POST' }, response);
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['set-cookie'], /^stats_session=;.*Max-Age=0/);
  assert.equal(verifySessionToken(token, secret, now + 1), true);
});

test('stats route rejects unauthenticated requests and returns zero-filled aggregates', async () => {
  const { createSessionToken, createSessionCookie } = load('api/_lib/auth.js');
  const { createStatsHandler } = load('api/stats/index.js');
  const now = Date.UTC(2026, 6, 24, 12);
  const secret = 'a sufficiently long session secret';
  const handler = createStatsHandler({
    query: async () => [],
    env: { STATS_SESSION_SECRET: secret },
    now: () => now,
  });

  const unauthorized = responseHarness();
  await handler({ method: 'GET', query: { days: '7' }, headers: {} }, unauthorized);
  assert.equal(unauthorized.statusCode, 401);

  const token = createSessionToken(secret, now);
  const response = responseHarness();
  await handler({
    method: 'GET',
    query: { days: '7' },
    headers: { cookie: createSessionCookie(token, false) },
  }, response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.range, { days: 7, from: '2026-07-18', to: '2026-07-24' });
  assert.deepEqual(response.body.kpis, {
    visits: 0,
    uniqueVisitors: 0,
    orders: 0,
    conversionRate: 0,
    averageCheck: 0,
  });
  assert.equal(response.body.visitsByDay.length, 7);
  assert.equal(response.body.ordersByHour.length, 24);
  assert.equal(response.body.ordersByWeekday.length, 7);
  assert.deepEqual(response.body.deliveryMethods.map((row) => row.method), ['delivery', 'pickup']);
  assert.deepEqual(response.body.paymentMethods.map((row) => row.method), ['card', 'cash', 'kaspi_invoice']);
  for (const key of ['topViewedProducts', 'topOrderedProducts', 'abandonedProducts']) {
    assert.deepEqual(response.body[key], []);
  }
});

test('stats conversion uses deduped visit events, is capped at 100, and waits 24 hours for abandonment', async () => {
  const { aggregate } = load('api/stats/index.js');
  const run = async (kpis) => {
    let call = 0;
    const sql = [];
    const result = await aggregate(async (text) => {
      sql.push(text);
      call += 1;
      return call === 1 ? [kpis] : [];
    }, '2026-07-18', '2026-07-24', 7);
    return { result, sql };
  };

  const normal = await run({ visits: 10, unique_visitors: 2, unique_orders: 1, revenue: 100 });
  assert.equal(normal.result.kpis.conversionRate, 10);
  assert.match(normal.sql[8], /last_at\s*<=\s*now\(\)\s*-\s*interval '24 hours'/i);

  const capped = await run({ visits: 10, unique_visitors: 1, unique_orders: 20, revenue: 2000 });
  assert.equal(capped.result.kpis.conversionRate, 100);
});

test('stats route rejects tampered and expired session cookies', async () => {
  const { createSessionToken, createSessionCookie } = load('api/_lib/auth.js');
  const { createStatsHandler } = load('api/stats/index.js');
  const now = Date.UTC(2026, 6, 24, 12);
  const secret = 'a sufficiently long session secret';
  const handler = createStatsHandler({
    query: async () => [],
    env: { STATS_SESSION_SECRET: secret },
    now: () => now,
  });
  const validToken = createSessionToken(secret, now);
  const expiredToken = createSessionToken(secret, now - (12 * 60 * 60 * 1000));
  const cookies = [
    createSessionCookie(`${validToken.slice(0, -1)}x`, false),
    createSessionCookie(expiredToken, false),
  ];

  for (const cookie of cookies) {
    const response = responseHarness();
    await handler({ method: 'GET', query: { days: '30' }, headers: { cookie } }, response);
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { error: 'Authentication required' });
  }
});

test('analytics migration includes required constraints and query indexes', () => {
  const sql = fs.readFileSync(
    path.resolve(__dirname, '../sql/001_analytics.sql'),
    'utf8',
  );
  assert.match(sql, /ON analytics_events \(event_type, restaurant_date\)/i);
  assert.match(sql, /ON analytics_events \(event_type, occurred_at\)/i);
  assert.match(sql, /ON analytics_events \(visitor_id, occurred_at\)/i);
  assert.match(sql, /UNIQUE INDEX[\s\S]*ON analytics_events \(event_key\)[\s\S]*event_type = 'order_completed'/i);
  assert.match(sql, /UNIQUE INDEX[\s\S]*ON analytics_events \(visitor_id, restaurant_date\)[\s\S]*event_type = 'visit'/i);
  assert.doesNotMatch(sql, /\b(phone|address|comment|referrer|user_agent|ip_address)\b/i);
});
