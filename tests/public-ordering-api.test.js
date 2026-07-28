const test = require('node:test');
const assert = require('node:assert/strict');

const tableId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const orderId = '33333333-3333-4333-8333-333333333333';
const dishId = '44444444-4444-4444-8444-444444444444';
const unavailableId = '55555555-5555-4555-8555-555555555555';
const authorize = async () => true;

function load(relativePath) {
  return require(`../${relativePath}`);
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

test('public route modules export Vercel handlers and injected factories', () => {
  const routes = [
    ['api/tables/[token].js', 'createTableHandler'],
    ['api/menu.js', 'createMenuHandler'],
    ['api/orders/index.js', 'createOrderHandler'],
    ['api/orders/[id]/index.js', 'createOrderDetailsHandler'],
    ['api/sessions/[id]/bill.js', 'createBillHandler'],
    ['api/sessions/[id]/close.js', 'createCloseSessionHandler'],
    ['api/orders/[id]/status.js', 'createOrderStatusHandler'],
    ['api/orders/[id]/telegram-message.js', 'createTelegramMessageHandler'],
    ['api/sessions/open.js', 'createOpenSessionsHandler'],
  ];
  for (const [route, factory] of routes) {
    const exported = load(route);
    assert.equal(typeof exported, 'function');
    assert.equal(typeof exported[factory], 'function');
  }
});

test('order creation locks the target session row before inserting', () => {
  const { CREATE_ORDER_SQL } = load('api/orders/index.js');
  assert.match(
    CREATE_ORDER_SQL,
    /session_info AS \([\s\S]*FROM table_sessions s[\s\S]*WHERE s\.id = \$1::uuid[\s\S]*FOR UPDATE[\s\S]*\)/i,
  );
  assert.match(
    CREATE_ORDER_SQL,
    /INSERT INTO orders[\s\S]*JOIN session_info session ON session\.status = 'open'/i,
  );
});

test('table token resolves a table and concurrently safe open session', async () => {
  const { createTableHandler } = load('api/tables/[token].js');
  const calls = [];
  const query = async (sql, values) => {
    calls.push({ sql, values });
    return [{
      table_id: tableId,
      table_number: '12',
      session_id: sessionId,
      session_status: 'open',
      opened_at: '2026-07-27T10:00:00.000Z',
    }];
  };
  const response = await invoke(createTableHandler({ query }), {
    method: 'GET',
    query: { token: 'safe_Table-token-1234' },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    table: { id: tableId, number: '12' },
    session: { id: sessionId, status: 'open', openedAt: '2026-07-27T10:00:00.000Z' },
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].values, ['safe_Table-token-1234']);
  assert.match(calls[0].sql, /ON CONFLICT \(table_id\) WHERE status = 'open'/i);
});

test('table route validates tokens, returns 404, and sets Allow', async () => {
  const { createTableHandler } = load('api/tables/[token].js');
  const handler = createTableHandler({ query: async () => [] });
  const invalid = await invoke(handler, { method: 'GET', query: { token: '../bad' } });
  const missing = await invoke(handler, { method: 'GET', query: { token: 'safe_Table-token-1234' } });
  const method = await invoke(handler, { method: 'POST', query: {} });
  assert.equal(invalid.statusCode, 400);
  assert.equal(missing.statusCode, 404);
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.allow, 'GET');
});

test('menu returns sorted available dishes with fixed-decimal prices', async () => {
  const { createMenuHandler } = load('api/menu.js');
  const handler = createMenuHandler({
    query: async () => [
      { category_id: tableId, category_name: 'Rolls', dish_id: dishId, dish_name: 'Server name', description: null, price: '12.5', photo_url: '/dish.jpg' },
      { category_id: sessionId, category_name: 'Drinks', dish_id: unavailableId, dish_name: 'Tea', description: 'Hot', price: 2, photo_url: null },
    ],
  });
  const response = await invoke(handler, { method: 'GET' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.categories[0].dishes[0], {
    id: dishId,
    name: 'Server name',
    description: null,
    price: '12.50',
    photoUrl: '/dish.jpg',
  });
  const method = await invoke(handler, { method: 'POST' });
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.allow, 'GET');
});

test('order creation uses one atomic query and server-authoritative returned values', async () => {
  const { createOrderHandler } = load('api/orders/index.js');
  const calls = [];
  const notifications = [];
  const query = async (sql, values) => {
    calls.push({ sql, values });
    return [{
      order_id: orderId,
      session_id: sessionId,
      status: 'new',
      total: '25',
      created_at: '2026-07-27T10:01:00.000Z',
      table_number: '12',
      session_status: 'open',
      items: [{ dishId, dishName: 'Server name', dishPrice: '12.50', quantity: 2, subtotal: '25.00' }],
      excluded_dish_ids: [unavailableId],
    }];
  };
  const handler = createOrderHandler({
    query,
    notify: async (order) => notifications.push(order),
  });
  const response = await invoke(handler, {
    method: 'POST',
    body: {
      session_id: sessionId,
      items: [
        { dish_id: dishId, quantity: 2 },
        { dish_id: unavailableId, quantity: 1 },
      ],
    },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /WITH[\s\S]*INSERT INTO orders[\s\S]*INSERT INTO order_items/i);
  assert.deepEqual(calls[0].values, [
    sessionId,
    JSON.stringify([{ dish_id: dishId, quantity: 2 }, { dish_id: unavailableId, quantity: 1 }]),
  ]);
  assert.deepEqual(response.body.excludedDishIds, [unavailableId]);
  assert.equal(response.body.order.total, '25.00');
  assert.deepEqual(response.body.order.table, { number: '12' });
  assert.equal(response.body.order.items[0].dishName, 'Server name');
  assert.equal(notifications.length, 1);
  assert.deepEqual(notifications[0], response.body.order);
});

test('order creation rejects malformed bodies and does not create empty orders', async () => {
  const { createOrderHandler } = load('api/orders/index.js');
  let calls = 0;
  const invalidHandler = createOrderHandler({ query: async () => { calls += 1; return []; } });
  const invalidBodies = [
    null,
    { session_id: 'bad', items: [{ dish_id: dishId, quantity: 1 }] },
    { session_id: sessionId, items: [] },
    { session_id: sessionId, items: [{ dish_id: 'bad', quantity: 1 }] },
    { session_id: sessionId, items: [{ dish_id: dishId, quantity: 0 }] },
    { session_id: sessionId, items: [{ dish_id: dishId, quantity: 100 }] },
    { session_id: sessionId, items: [{ dish_id: dishId, quantity: 1, price: 0 }] },
    { session_id: sessionId, items: [{ dish_id: dishId, quantity: 1 }], total: 0 },
    { sessionId, items: [{ dishId, quantity: 1 }] },
  ];
  for (const body of invalidBodies) {
    const response = await invoke(invalidHandler, { method: 'POST', body });
    assert.equal(response.statusCode, 400);
  }
  assert.equal(calls, 0);

  const unavailable = await invoke(createOrderHandler({
    query: async () => [{ order_id: null, session_status: 'open', excluded_dish_ids: [dishId] }],
  }), { method: 'POST', body: { session_id: sessionId, items: [{ dish_id: dishId, quantity: 1 }] } });
  assert.equal(unavailable.statusCode, 409);
  assert.deepEqual(unavailable.body, {
    error: 'No requested dishes are available',
    excludedDishIds: [dishId],
  });
});

test('order creation distinguishes missing and closed sessions from unavailable dishes', async () => {
  const { createOrderHandler } = load('api/orders/index.js');
  const body = { session_id: sessionId, items: [{ dish_id: dishId, quantity: 1 }] };
  const missing = await invoke(createOrderHandler({
    query: async () => [{ order_id: null, session_status: null, excluded_dish_ids: [] }],
  }), { method: 'POST', body });
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.body, { error: 'Session not found' });

  const closed = await invoke(createOrderHandler({
    query: async () => [{ order_id: null, session_status: 'closed', excluded_dish_ids: [] }],
  }), { method: 'POST', body });
  assert.equal(closed.statusCode, 409);
  assert.deepEqual(closed.body, { error: 'Session is not open' });
});

test('order notification failures and timeouts never fail successful orders', async () => {
  const { createOrderHandler } = load('api/orders/index.js');
  const row = {
    order_id: orderId,
    session_id: sessionId,
    status: 'new',
    total: '12.50',
    created_at: '2026-07-27T10:01:00.000Z',
    table_number: '12',
    session_status: 'open',
    items: [],
    excluded_dish_ids: [],
  };
  const cases = [
    [async () => { throw new Error('BOT_INTERNAL_API_SECRET=top-secret'); }, 'rejected'],
    [async () => new Promise(() => {}), 'timed out'],
  ];
  for (const [notify, expectedMessage] of cases) {
    const logs = [];
    const response = await invoke(createOrderHandler({
      query: async () => [row],
      notify,
      logger: { warn: (...args) => logs.push(args) },
      notificationTimeoutMs: 5,
    }), { method: 'POST', body: { session_id: sessionId, items: [{ dish_id: dishId, quantity: 1 }] } });
    assert.equal(response.statusCode, 201);
    assert.equal(response.body.order.id, orderId);
    assert.equal(logs.length, 1);
    assert.match(logs[0][0], new RegExp(expectedMessage, 'i'));
    assert.doesNotMatch(JSON.stringify(logs), /top-secret|BOT_INTERNAL_API_SECRET/);
  }
});

test('order notification timeout aborts the live request and logs once', async () => {
  const { createOrderHandler } = load('api/orders/index.js');
  let receivedSignal;
  const logs = [];
  const response = await invoke(createOrderHandler({
    query: async () => [{
      order_id: orderId,
      session_id: sessionId,
      status: 'new',
      total: '12.50',
      created_at: '2026-07-27T10:01:00.000Z',
      table_number: '12',
      session_status: 'open',
      items: [],
      excluded_dish_ids: [],
    }],
    notify: async (_order, signal) => {
      receivedSignal = signal;
      return new Promise((resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('top-secret')), { once: true });
      });
    },
    logger: { warn: (...args) => logs.push(args) },
    notificationTimeoutMs: 5,
  }), {
    method: 'POST',
    body: { session_id: sessionId, items: [{ dish_id: dishId, quantity: 1 }] },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(receivedSignal?.aborted, true);
  assert.equal(logs.length, 1);
  assert.match(logs[0][0], /timed out/i);
  assert.doesNotMatch(JSON.stringify(logs), /top-secret/);
});

test('bot notifier posts the internal secret header and order payload', async () => {
  const { createOrderNotifier } = load('api/_lib/order-notification.js');
  const calls = [];
  const notify = createOrderNotifier({
    env: {
      BOT_INTERNAL_API_URL: 'https://bot.example.test/',
      BOT_INTERNAL_API_SECRET: 'internal-secret',
    },
    fetchImpl: async (...args) => {
      calls.push(args);
      return { ok: true };
    },
  });
  const order = { id: orderId, sessionId, total: '12.50', items: [] };
  const controller = new AbortController();
  await notify(order, controller.signal);
  assert.equal(calls[0][0], 'https://bot.example.test/internal/orders/new');
  assert.equal(calls[0][1].headers.Authorization, 'Bearer internal-secret');
  assert.equal(calls[0][1].signal, controller.signal);
  assert.deepEqual(JSON.parse(calls[0][1].body), { order });
});

test('order details and bill return 404s and serialize money consistently', async () => {
  const { createOrderDetailsHandler } = load('api/orders/[id]/index.js');
  const { createBillHandler } = load('api/sessions/[id]/bill.js');
  const missingOrder = await invoke(createOrderDetailsHandler({ query: async () => [] }), {
    method: 'GET', query: { id: orderId },
  });
  assert.equal(missingOrder.statusCode, 404);
  const order = await invoke(createOrderDetailsHandler({ query: async () => [{
    order_id: orderId, session_id: sessionId, status: 'ready', total: '3.5',
    created_at: '2026-07-27T10:01:00.000Z', table_number: '12',
    items: [{ dishId, dishName: 'Tea', dishPrice: 3.5, quantity: 1, subtotal: 3.5 }],
  }] }), { method: 'GET', query: { id: orderId } });
  assert.equal(order.body.order.total, '3.50');
  assert.equal(order.body.order.items[0].subtotal, '3.50');
  assert.deepEqual(order.body.order.table, { number: '12' });
  const { ORDER_DETAILS_SQL } = load('api/orders/[id]/index.js');
  assert.match(ORDER_DETAILS_SQL, /JOIN table_sessions s ON s\.id = o\.session_id/i);
  assert.match(ORDER_DETAILS_SQL, /JOIN restaurant_tables t ON t\.id = s\.table_id/i);
  assert.match(ORDER_DETAILS_SQL, /t\.number AS table_number/i);

  const missingBill = await invoke(createBillHandler({ authorize, query: async () => [] }), {
    method: 'GET', query: { id: sessionId },
  });
  assert.equal(missingBill.statusCode, 404);
  const bill = await invoke(createBillHandler({ authorize, query: async () => [{
    session_id: sessionId, status: 'open', opened_at: '2026-07-27T10:00:00.000Z',
    closed_at: null, table_id: tableId, table_number: '12', total: '3.5', orders: [],
  }] }), { method: 'GET', query: { id: sessionId } });
  assert.equal(bill.statusCode, 200);
  assert.equal(bill.body.total, '3.50');
});

test('status route permits only new to cooking to ready transitions', async () => {
  const { createOrderStatusHandler } = load('api/orders/[id]/status.js');
  const success = await invoke(createOrderStatusHandler({ authorize, query: async () => [{
    order_id: orderId, session_id: sessionId, status: 'cooking', total: '12.50',
    created_at: '2026-07-27T10:01:00.000Z', items: [],
  }] }), { method: 'POST', query: { id: orderId }, body: { status: 'cooking' } });
  assert.equal(success.statusCode, 200);
  assert.equal(success.body.order.status, 'cooking');

  const conflict = await invoke(createOrderStatusHandler({ authorize, query: async () => [{ exists: true, order_id: null }] }), {
    method: 'POST', query: { id: orderId }, body: { status: 'ready' },
  });
  assert.equal(conflict.statusCode, 409);
  const missing = await invoke(createOrderStatusHandler({ authorize, query: async () => [] }), {
    method: 'POST', query: { id: orderId }, body: { status: 'ready' },
  });
  assert.equal(missing.statusCode, 404);
  const invalid = await invoke(createOrderStatusHandler({ authorize, query: async () => [] }), {
    method: 'POST', query: { id: orderId }, body: { status: 'new' },
  });
  assert.equal(invalid.statusCode, 400);
});

test('telegram message route stores a positive safe integer with parameterized SQL', async () => {
  const { createTelegramMessageHandler } = load('api/orders/[id]/telegram-message.js');
  const calls = [];
  const response = await invoke(createTelegramMessageHandler({
    authorize,
    query: async (sql, values) => {
      calls.push({ sql, values });
      return [{ id: orderId, telegram_message_id: '9007199254740991' }];
    },
  }), {
    method: 'POST',
    query: { id: orderId },
    body: { telegram_message_id: Number.MAX_SAFE_INTEGER },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    order: { id: orderId, telegramMessageId: '9007199254740991' },
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].values, [orderId, Number.MAX_SAFE_INTEGER]);
  assert.match(calls[0].sql, /telegram_message_id\s*=\s*\$2::bigint/i);
});

test('telegram message route rejects malformed input, returns 404, and hides errors', async () => {
  const { createTelegramMessageHandler } = load('api/orders/[id]/telegram-message.js');
  let calls = 0;
  const handler = createTelegramMessageHandler({
    authorize,
    query: async () => {
      calls += 1;
      return [];
    },
  });
  const invalidBodies = [
    null,
    {},
    { telegram_message_id: 0 },
    { telegram_message_id: -1 },
    { telegram_message_id: '1' },
    { telegram_message_id: Number.MAX_SAFE_INTEGER + 1 },
    { telegram_message_id: 1, extra: true },
  ];
  for (const body of invalidBodies) {
    const response = await invoke(handler, {
      method: 'POST',
      query: { id: orderId },
      body,
    });
    assert.equal(response.statusCode, 400);
  }
  assert.equal(calls, 0);

  const missing = await invoke(handler, {
    method: 'POST',
    query: { id: orderId },
    body: { telegram_message_id: 1 },
  });
  assert.equal(missing.statusCode, 404);

  const failure = await invoke(createTelegramMessageHandler({
    authorize,
    query: async () => { throw new Error('password=secret'); },
  }), {
    method: 'POST',
    query: { id: orderId },
    body: { telegram_message_id: 1 },
  });
  assert.equal(failure.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(failure.body), /password|secret/i);
});

test('waiter message route reads and stores durable notification state', async () => {
  const { createWaiterMessageHandler } = load('api/orders/[id]/waiter-message.js');
  const calls = [];
  const handler = createWaiterMessageHandler({
    authorize,
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (/UPDATE orders/i.test(sql)) {
        return [{ id: orderId, waiter_message_id: '123' }];
      }
      return [{ id: orderId, waiter_message_id: null }];
    },
  });

  const readResponse = await invoke(handler, {
    method: 'GET',
    query: { id: orderId },
  });
  assert.equal(readResponse.statusCode, 200);
  assert.deepEqual(readResponse.body, {
    order: { id: orderId, waiterMessageId: null },
  });

  const saveResponse = await invoke(handler, {
    method: 'POST',
    query: { id: orderId },
    body: { waiter_message_id: 123, claim_token: dishId },
  });
  assert.equal(saveResponse.statusCode, 200);
  assert.deepEqual(saveResponse.body, {
    order: { id: orderId, waiterMessageId: '123' },
  });
  assert.deepEqual(
    calls.map(({ values }) => values),
    [[orderId], [orderId, 123, dishId]],
  );
  assert.match(calls[1].sql, /waiter_message_id\s*=\s*\$2::bigint/i);
});

test('waiter message route authorizes before validation and rejects malformed writes', async () => {
  const { createWaiterMessageHandler } = load('api/orders/[id]/waiter-message.js');
  let queryCalls = 0;
  const unauthorized = createWaiterMessageHandler({
    authorize: async (_request, response) => {
      response.status(401).json({ error: 'Unauthorized' });
      return false;
    },
    query: async () => {
      queryCalls += 1;
      return [];
    },
  });
  const denied = await invoke(unauthorized, {
    method: 'POST',
    query: { id: 'not-a-uuid' },
    body: { waiter_message_id: 0 },
  });
  assert.equal(denied.statusCode, 401);
  assert.equal(queryCalls, 0);

  const handler = createWaiterMessageHandler({
    authorize,
    query: async () => {
      queryCalls += 1;
      return [];
    },
  });
  for (const body of [
    null,
    {},
    { waiter_message_id: 0 },
    { waiter_message_id: -1 },
    { waiter_message_id: '1' },
    { waiter_message_id: Number.MAX_SAFE_INTEGER + 1 },
    { waiter_message_id: 1 },
    { waiter_message_id: 1, claim_token: 'not-a-uuid' },
    { waiter_message_id: 1, claim_token: dishId, extra: true },
  ]) {
    const response = await invoke(handler, {
      method: 'POST',
      query: { id: orderId },
      body,
    });
    assert.equal(response.statusCode, 400);
  }
  assert.equal(queryCalls, 0);
});

test('waiter notification claim atomically grants one lease and supports stale reclaim', async () => {
  const {
    createWaiterNotificationClaimHandler,
    CLAIM_WAITER_NOTIFICATION_SQL,
  } = load('api/orders/[id]/waiter-notification-claim.js');
  const calls = [];
  const handler = createWaiterNotificationClaimHandler({
    authorize,
    query: async (sql, values) => {
      calls.push({ sql, values });
      return [{
        id: orderId,
        waiter_message_id: null,
        claim_token: dishId,
      }];
    },
  });

  const response = await invoke(handler, {
    method: 'POST',
    query: { id: orderId },
    body: {},
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    order: {
      id: orderId,
      waiterMessageId: null,
      waiterNotificationClaimToken: dishId,
    },
  });
  assert.deepEqual(calls[0].values, [orderId]);
  assert.match(CLAIM_WAITER_NOTIFICATION_SQL, /UPDATE orders/i);
  assert.match(CLAIM_WAITER_NOTIFICATION_SQL, /waiter_message_id\s+IS NULL/i);
  assert.match(CLAIM_WAITER_NOTIFICATION_SQL, /waiter_notification_claimed_at\s*</i);
  assert.match(CLAIM_WAITER_NOTIFICATION_SQL, /INTERVAL\s+'[^']+'/i);
});

test('waiter notification claim denial and release are safe and conditional', async () => {
  const { createWaiterNotificationClaimHandler } =
    load('api/orders/[id]/waiter-notification-claim.js');
  const calls = [];
  const handler = createWaiterNotificationClaimHandler({
    authorize,
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (values.length === 1) {
        return [{
          id: orderId,
          waiter_message_id: null,
          claim_token: null,
        }];
      }
      return [{ id: orderId, released: true }];
    },
  });

  const denied = await invoke(handler, {
    method: 'POST',
    query: { id: orderId },
    body: {},
  });
  assert.equal(denied.statusCode, 200);
  assert.equal(
    denied.body.order.waiterNotificationClaimToken,
    null,
  );

  const released = await invoke(handler, {
    method: 'DELETE',
    query: { id: orderId },
    body: { claim_token: dishId },
  });
  assert.equal(released.statusCode, 200);
  assert.deepEqual(released.body, { released: true });
  assert.deepEqual(calls[1].values, [orderId, dishId]);
  assert.match(calls[1].sql, /waiter_notification_claim_token\s*=\s*\$2::uuid/i);
  assert.match(calls[1].sql, /waiter_message_id\s+IS NULL/i);
});

test('waiter message save is claim-conditional and reports the first persisted delivery', async () => {
  const { createWaiterMessageHandler } = load('api/orders/[id]/waiter-message.js');
  const calls = [];
  const handler = createWaiterMessageHandler({
    authorize,
    query: async (sql, values) => {
      calls.push({ sql, values });
      return [{
        exists: true,
        id: orderId,
        waiter_message_id: '123',
        saved: true,
      }];
    },
  });

  const response = await invoke(handler, {
    method: 'POST',
    query: { id: orderId },
    body: { waiter_message_id: 123, claim_token: dishId },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    order: { id: orderId, waiterMessageId: '123' },
  });
  assert.deepEqual(calls[0].values, [orderId, 123, dishId]);
  assert.match(calls[0].sql, /waiter_message_id\s+IS NULL/i);
  assert.match(calls[0].sql, /waiter_notification_claim_token\s*=\s*\$3::uuid/i);
  assert.match(calls[0].sql, /waiter_notification_claimed_at\s*=\s*NULL/i);
});

test('open sessions route lists tables in deterministic order with fixed totals', async () => {
  const { createOpenSessionsHandler, OPEN_SESSIONS_SQL } = load('api/sessions/open.js');
  const response = await invoke(createOpenSessionsHandler({
    authorize,
    query: async () => [
      { session_id: sessionId, table_id: tableId, table_number: '2', order_count: '3', total: '7.5' },
      { session_id: orderId, table_id: dishId, table_number: '12', order_count: 0, total: 0 },
    ],
  }), { method: 'GET' });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    tables: [
      {
        sessionId,
        table: { id: tableId, number: '2' },
        orderCount: 3,
        total: '7.50',
      },
      {
        sessionId: orderId,
        table: { id: dishId, number: '12' },
        orderCount: 0,
        total: '0.00',
      },
    ],
  });
  assert.match(OPEN_SESSIONS_SQL, /WHERE s\.status = 'open'/i);
  assert.match(
    OPEN_SESSIONS_SQL,
    /ORDER BY[\s\S]*CASE WHEN t\.number ~ '\^\[0-9\]\+\$' THEN t\.number::numeric END NULLS LAST[\s\S]*lower\(t\.number\)[\s\S]*t\.number[\s\S]*t\.id/i,
  );

  const empty = await invoke(createOpenSessionsHandler({
    authorize,
    query: async () => [],
  }), { method: 'GET' });
  assert.equal(empty.statusCode, 200);
  assert.deepEqual(empty.body, { tables: [] });
});

test('close route closes only an open session and reports conflict otherwise', async () => {
  const { createCloseSessionHandler } = load('api/sessions/[id]/close.js');
  const success = await invoke(createCloseSessionHandler({ authorize, query: async () => [{
    id: sessionId, status: 'closed', opened_at: '2026-07-27T10:00:00.000Z',
    closed_at: '2026-07-27T11:00:00.000Z',
  }] }), { method: 'POST', query: { id: sessionId }, body: {} });
  assert.equal(success.statusCode, 200);
  assert.equal(success.body.session.status, 'closed');

  const conflict = await invoke(createCloseSessionHandler({ authorize, query: async () => [{ exists: true, id: null }] }), {
    method: 'POST', query: { id: sessionId }, body: {},
  });
  assert.equal(conflict.statusCode, 409);
  const missing = await invoke(createCloseSessionHandler({ authorize, query: async () => [] }), {
    method: 'POST', query: { id: sessionId }, body: {},
  });
  assert.equal(missing.statusCode, 404);
  const wrongMethod = await invoke(createCloseSessionHandler({ query: async () => [] }), {
    method: 'GET', query: { id: sessionId },
  });
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.headers.allow, 'POST');
});

test('close route accepts no body and rejects non-empty bodies', async () => {
  const { createCloseSessionHandler } = load('api/sessions/[id]/close.js');
  let calls = 0;
  const handler = createCloseSessionHandler({ authorize, query: async () => {
    calls += 1;
    return [{
      id: sessionId,
      status: 'closed',
      opened_at: '2026-07-27T10:00:00.000Z',
      closed_at: '2026-07-27T11:00:00.000Z',
    }];
  } });
  const bodyless = await invoke(handler, { method: 'POST', query: { id: sessionId } });
  assert.equal(bodyless.statusCode, 200);
  const unknown = await invoke(handler, {
    method: 'POST',
    query: { id: sessionId },
    body: { reason: 'done' },
  });
  assert.equal(unknown.statusCode, 400);
  assert.equal(calls, 1);
});

test('all public handlers reject bad UUIDs and hide database errors', async () => {
  const factories = [
    [load('api/orders/[id]/index.js').createOrderDetailsHandler, 'GET', undefined],
    [load('api/sessions/[id]/bill.js').createBillHandler, 'GET', undefined],
    [load('api/sessions/[id]/close.js').createCloseSessionHandler, 'POST', {}],
    [load('api/orders/[id]/status.js').createOrderStatusHandler, 'POST', { status: 'ready' }],
  ];
  for (const [factory, method, body] of factories) {
    const badId = await invoke(factory({ authorize, query: async () => [] }), {
      method, query: { id: 'not-a-uuid' }, body,
    });
    assert.equal(badId.statusCode, 400);
    const failure = await invoke(factory({ authorize, query: async () => { throw new Error('password=secret'); } }), {
      method, query: { id: orderId }, body,
    });
    assert.equal(failure.statusCode, 500);
    assert.doesNotMatch(JSON.stringify(failure.body), /password|secret/i);
  }
});
