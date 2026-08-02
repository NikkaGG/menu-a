const test = require('node:test');
const assert = require('node:assert/strict');

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

const authorized = async () => true;

test('admin stats exports a Vercel handler and injectable factory', () => {
  const exported = require('../server/api/admin/stats');
  assert.equal(typeof exported, 'function');
  assert.equal(typeof exported.createAdminStatsHandler, 'function');
});

test('admin stats rejects unsupported methods before authorization and fails closed', async () => {
  const { createAdminStatsHandler } = require('../server/api/admin/stats');
  let authorizedCalls = 0;
  let queryCalls = 0;
  const query = async () => { queryCalls += 1; return []; };
  const method = await invoke(createAdminStatsHandler({
    query,
    authorize: async () => { authorizedCalls += 1; return true; },
  }), { method: 'POST' });
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.allow, 'GET');
  assert.equal(authorizedCalls, 0);

  const denied = await invoke(createAdminStatsHandler({ query }), {
    method: 'GET',
    query: { from: '2026-01-01', to: '2026-01-02' },
  });
  assert.equal(denied.statusCode, 401);
  assert.deepEqual(denied.body, { error: 'Unauthorized' });
  assert.equal(queryCalls, 0);
});

test('admin stats validates strict real dates, ordering, range length, and grouping', async () => {
  const { createAdminStatsHandler } = require('../server/api/admin/stats');
  let queryCalls = 0;
  const handler = createAdminStatsHandler({
    authorize: authorized,
    query: async () => { queryCalls += 1; return []; },
  });
  const invalidQueries = [
    {},
    { from: '2026-01-01' },
    { to: '2026-01-01' },
    { from: '2026-1-01', to: '2026-01-02' },
    { from: '2026-02-29', to: '2026-03-01' },
    { from: '2026-01-02', to: '2026-01-01' },
    { from: '2025-01-01', to: '2026-01-02' },
    { from: '2026-01-01', to: '2026-01-02', groupBy: '' },
    { from: '2026-01-01', to: '2026-01-02', groupBy: 'year' },
    { from: ['2026-01-01'], to: '2026-01-02' },
  ];
  for (const query of invalidQueries) {
    const response = await invoke(handler, { method: 'GET', query });
    assert.equal(response.statusCode, 400, JSON.stringify(query));
    assert.deepEqual(response.body, { error: 'Invalid statistics range' });
  }
  assert.equal(queryCalls, 0);
});

test('admin stats sends inclusive Almaty dates as exact half-open UTC bounds', async () => {
  const { createAdminStatsHandler } = require('../server/api/admin/stats');
  const calls = [];
  const handler = createAdminStatsHandler({
    authorize: authorized,
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (/summary/i.test(sql)) {
        return [{ revenue: '0', profit: null, order_count: 0, average_check: null }];
      }
      return [];
    },
  });
  const response = await invoke(handler, {
    method: 'GET',
    query: { from: '2026-03-01', to: '2026-03-31', groupBy: 'week' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.deepEqual(call.values.slice(0, 2), [
      '2026-02-28T19:00:00.000Z',
      '2026-03-31T19:00:00.000Z',
    ]);
  }
  assert.deepEqual(calls[1].values, [
    '2026-02-28T19:00:00.000Z',
    '2026-03-31T19:00:00.000Z',
    'week',
  ]);
  assert.match(calls[0].sql, /FROM orders/i);
  assert.doesNotMatch(calls.map(({ sql }) => sql).join('\n'), /analytics_events/i);
  assert.deepEqual(response.body.range, {
    from: '2026-03-01',
    to: '2026-03-31',
    groupBy: 'week',
    timeZone: 'Asia/Almaty',
  });
});

test('admin stats defaults grouping only when omitted and accepts a 366-day inclusive range', async () => {
  const { createAdminStatsHandler } = require('../server/api/admin/stats');
  const calls = [];
  const handler = createAdminStatsHandler({
    authorize: authorized,
    query: async (sql, values) => {
      calls.push({ sql, values });
      return /summary/i.test(sql)
        ? [{ revenue: '0.00', profit: null, order_count: 0, average_check: null }]
        : [];
    },
  });
  const response = await invoke(handler, {
    method: 'GET',
    query: { from: '2024-01-01', to: '2024-12-31' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.range.groupBy, 'day');
  assert.equal(calls[1].values[2], 'day');
});

test('admin stats serializes aggregate rows exactly and preserves shared buckets', async () => {
  const { createAdminStatsHandler } = require('../server/api/admin/stats');
  const calls = [];
  const query = async (sql, values) => {
    calls.push({ sql, values });
    if (/summary/i.test(sql)) {
      return [{
        revenue: '123456789012345.6',
        profit: '15',
        order_count: 7,
        average_check: '17636684144620.8',
      }];
    }
    if (/points/i.test(sql)) {
      return [
        { date: '2026-01-05', revenue: '30.1', profit: '4.25' },
        { date: '2026-01-12', revenue: '7', profit: null },
      ];
    }
    return [
      { dish_name: 'Avocado', quantity: '9' },
      { dish_name: 'Tuna', quantity: 9 },
    ];
  };
  const response = await invoke(createAdminStatsHandler({ query, authorize: authorized }), {
    method: 'GET',
    query: { from: '2026-01-05', to: '2026-01-18', groupBy: 'week' },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    range: {
      from: '2026-01-05',
      to: '2026-01-18',
      groupBy: 'week',
      timeZone: 'Asia/Almaty',
    },
    totalRevenue: '123456789012345.60',
    totalProfit: '15.00',
    orderCount: 7,
    averageCheck: '17636684144620.80',
    points: [
      { date: '2026-01-05', revenue: '30.10', profit: '4.25' },
      { date: '2026-01-12', revenue: '7.00', profit: null },
    ],
    topDishes: [
      { dish_name: 'Avocado', quantity: 9 },
      { dish_name: 'Tuna', quantity: 9 },
    ],
  });

  const allSql = calls.map(({ sql }) => sql).join('\n');
  assert.match(allSql, /date_trunc\(\$3,\s*o\.created_at AT TIME ZONE 'Asia\/Almaty'\)/i);
  assert.match(allSql, /JOIN order_items/i);
  assert.match(allSql, /JOIN dishes/i);
  assert.match(allSql, /d\.cost_price IS NOT NULL/i);
  assert.match(allSql, /\(oi\.dish_price - d\.cost_price\)\s*\*\s*oi\.quantity/i);
  assert.match(allSql, /GROUP BY[\s\S]*dish_name/i);
  assert.match(allSql, /ORDER BY quantity DESC,\s*dish_name ASC/i);
  assert.match(allSql, /LIMIT 5/i);
  assert.match(allSql, /SUM\(o\.total\)/i);
  const revenueCte = calls[0].sql.match(/revenue_summary AS \(([\s\S]*?)\),\s*profit_summary/i)[1];
  assert.doesNotMatch(revenueCte, /JOIN order_items/i);
  assert.match(revenueCte, /SUM\(o\.total\)/i);
  assert.match(revenueCte, /COUNT\(\*\)/i);
  assert.match(revenueCte, /SUM\(o\.total\)\s*\/\s*COUNT\(\*\)/i);
  assert.equal((revenueCte.match(/\bFROM\s+orders\b/gi) || []).length, 1);
  const profitCte = calls[0].sql.match(/profit_summary AS \(([\s\S]*?)\)\s*SELECT/i)[1];
  assert.equal((profitCte.match(/\bFROM\s+orders\b/gi) || []).length, 1);
  assert.equal(calls.length, 3);
});

test('admin stats returns exact empty aggregates and reports database errors safely', async () => {
  const { createAdminStatsHandler } = require('../server/api/admin/stats');
  const empty = await invoke(createAdminStatsHandler({
    authorize: authorized,
    query: async (sql) => (/summary/i.test(sql)
      ? [{ revenue: '0', profit: null, order_count: 0, average_check: null }]
      : []),
  }), {
    method: 'GET',
    query: { from: '2026-01-01', to: '2026-01-01', groupBy: 'month' },
  });
  assert.equal(empty.statusCode, 200);
  assert.deepEqual(empty.body, {
    range: {
      from: '2026-01-01',
      to: '2026-01-01',
      groupBy: 'month',
      timeZone: 'Asia/Almaty',
    },
    totalRevenue: '0.00',
    totalProfit: null,
    orderCount: 0,
    averageCheck: null,
    points: [],
    topDishes: [],
  });

  const failed = await invoke(createAdminStatsHandler({
    authorize: authorized,
    query: async () => { throw new Error('database secret'); },
  }), {
    method: 'GET',
    query: { from: '2026-01-01', to: '2026-01-02' },
  });
  assert.equal(failed.statusCode, 500);
  assert.deepEqual(failed.body, { error: 'Unable to load statistics' });
});

test('admin stats SQL keeps revenue independent while profit handles partial and deleted costs', async () => {
  const { createAdminStatsHandler } = require('../server/api/admin/stats');
  const calls = [];
  const handler = createAdminStatsHandler({
    authorize: authorized,
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (/summary/i.test(sql)) {
        return [{ revenue: '40.00', profit: null, order_count: 1, average_check: '40.00' }];
      }
      return [];
    },
  });
  const response = await invoke(handler, {
    method: 'GET',
    query: { from: '2026-02-01', to: '2026-02-02' },
  });
  assert.equal(response.body.totalRevenue, '40.00');
  assert.equal(response.body.totalProfit, null);

  const pointSql = calls[1].sql;
  assert.match(pointSql, /revenue_by_bucket[\s\S]*profit_by_bucket/i);
  assert.match(pointSql, /LEFT JOIN profit_by_bucket/i);
  assert.match(pointSql, /JOIN dishes d ON d\.id = oi\.dish_id/i);
  assert.match(pointSql, /ORDER BY bucket/i);
  assert.doesNotMatch(pointSql, /status\s*=/i);
});
