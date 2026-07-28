const test = require('node:test');
const assert = require('node:assert/strict');

const SECRET = 'a'.repeat(32);
const orderId = '33333333-3333-4333-8333-333333333333';

function load(relativePath) {
  return require(`../server/${relativePath}`);
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
  };
}

async function invoke(handler, request) {
  const response = responseHarness();
  await handler(request, response);
  return response;
}

test('bot authorizer accepts only an exact Bearer header with the configured secret', async () => {
  const { createBotAuthorizer } = load('api/_lib/bot-auth.js');
  const authorize = createBotAuthorizer({
    env: { BOT_INTERNAL_API_SECRET: SECRET },
  });
  const malformedHeaders = [
    {},
    { authorization: SECRET },
    { authorization: `bearer ${SECRET}` },
    { authorization: `Bearer  ${SECRET}` },
    { authorization: ` Bearer ${SECRET}` },
    { authorization: `Bearer ${SECRET} ` },
    { authorization: `Bearer ${SECRET.slice(0, -1)}b` },
  ];

  for (const headers of malformedHeaders) {
    const response = responseHarness();
    assert.equal(await authorize({ headers }, response), false);
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { error: 'Unauthorized' });
    assert.doesNotMatch(JSON.stringify(response.body), /secret|bearer/i);
  }

  const response = responseHarness();
  assert.equal(await authorize({
    headers: { authorization: `Bearer ${SECRET}` },
  }, response), true);
  assert.equal(response.body, undefined);
});

test('bot authorizer fails closed for missing or malformed secret configuration', async () => {
  const { createBotAuthorizer } = load('api/_lib/bot-auth.js');
  const invalidSecrets = [undefined, null, '', 'a'.repeat(31), 'a'.repeat(1025)];

  for (const secret of invalidSecrets) {
    const response = responseHarness();
    const authorize = createBotAuthorizer({
      env: { BOT_INTERNAL_API_SECRET: secret },
    });
    assert.equal(await authorize({
      headers: { authorization: `Bearer ${SECRET}` },
    }, response), false);
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { error: 'Unauthorized' });
  }
});

test('constant-time secret comparison handles equal and unequal byte lengths', () => {
  const { constantTimeEqual } = load('api/_lib/bot-auth.js');

  assert.equal(constantTimeEqual(Buffer.from('same'), Buffer.from('same')), true);
  assert.equal(constantTimeEqual(Buffer.from('same'), Buffer.from('diff')), false);
  assert.equal(constantTimeEqual(Buffer.from('short'), Buffer.from('much-longer')), false);
  assert.equal(constantTimeEqual(Buffer.from('much-longer'), Buffer.from('short')), false);
  assert.equal(constantTimeEqual('same', Buffer.from('same')), false);
});

test('bot-only routes authorize supported methods before validation and queries', async () => {
  const routes = [
    [load('api/orders/[id]/status.js').createOrderStatusHandler, 'POST', { status: 'ready' }],
    [load('api/sessions/[id]/bill.js').createBillHandler, 'GET', undefined],
    [load('api/sessions/[id]/close.js').createCloseSessionHandler, 'POST', {}],
    [load('api/orders/[id]/telegram-message.js').createTelegramMessageHandler, 'POST', { telegram_message_id: 1 }],
    [load('api/orders/[id]/waiter-message.js').createWaiterMessageHandler, 'GET', undefined],
    [load('api/orders/[id]/waiter-notification-claim.js').createWaiterNotificationClaimHandler, 'POST', {}],
    [load('api/sessions/open.js').createOpenSessionsHandler, 'GET', undefined],
  ];

  for (const [factory, method, body] of routes) {
    let authorizationCalls = 0;
    let queryCalls = 0;
    const handler = factory({
      authorize: async (_request, response) => {
        authorizationCalls += 1;
        response.status(401).json({ error: 'Unauthorized' });
        return false;
      },
      query: async () => {
        queryCalls += 1;
        return [];
      },
    });
    const response = await invoke(handler, {
      method,
      query: { id: 'not-a-uuid' },
      body,
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { error: 'Unauthorized' });
    assert.equal(authorizationCalls, 1);
    assert.equal(queryCalls, 0);
  }
});

test('bot-only route factories use injectable authorization and keep method checks first', async () => {
  const { createOrderStatusHandler } = load('api/orders/[id]/status.js');
  let authorizationCalls = 0;
  let queryCalls = 0;
  const handler = createOrderStatusHandler({
    authorize: async () => {
      authorizationCalls += 1;
      return true;
    },
    query: async () => {
      queryCalls += 1;
      return [{
        order_id: orderId,
        session_id: '22222222-2222-4222-8222-222222222222',
        status: 'ready',
        total: '12.50',
        created_at: '2026-07-27T10:01:00.000Z',
        items: [],
      }];
    },
  });

  const wrongMethod = await invoke(handler, {
    method: 'GET',
    query: { id: orderId },
  });
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.headers.allow, 'POST');
  assert.equal(authorizationCalls, 0);
  assert.equal(queryCalls, 0);

  const allowed = await invoke(handler, {
    method: 'POST',
    query: { id: orderId },
    body: { status: 'ready' },
  });
  assert.equal(allowed.statusCode, 200);
  assert.equal(authorizationCalls, 1);
  assert.equal(queryCalls, 1);
});

test('default bot-only handlers check methods and authorization before database setup', async () => {
  const routes = [
    [load('api/orders/[id]/status.js'), 'GET', 'POST'],
    [load('api/sessions/[id]/bill.js'), 'POST', 'GET'],
    [load('api/sessions/[id]/close.js'), 'GET', 'POST'],
    [load('api/orders/[id]/telegram-message.js'), 'GET', 'POST'],
    [load('api/orders/[id]/waiter-message.js'), 'PUT', 'GET'],
    [load('api/orders/[id]/waiter-notification-claim.js'), 'GET', 'POST'],
    [load('api/sessions/open.js'), 'POST', 'GET'],
  ];
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousSecret = process.env.BOT_INTERNAL_API_SECRET;
  delete process.env.DATABASE_URL;
  delete process.env.BOT_INTERNAL_API_SECRET;

  try {
    for (const [handler, wrongMethod, supportedMethod] of routes) {
      const methodResponse = await invoke(handler, { method: wrongMethod });
      assert.equal(methodResponse.statusCode, 405);

      const unauthorized = await invoke(handler, {
        method: supportedMethod,
        query: { id: 'not-a-uuid' },
      });
      assert.equal(unauthorized.statusCode, 401);
      assert.deepEqual(unauthorized.body, { error: 'Unauthorized' });
    }
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousSecret === undefined) delete process.env.BOT_INTERNAL_API_SECRET;
    else process.env.BOT_INTERNAL_API_SECRET = previousSecret;
  }
});

test('guest order polling route remains public', async () => {
  const { createOrderDetailsHandler } = load('api/orders/[id]/index.js');
  let queryCalls = 0;
  const response = await invoke(createOrderDetailsHandler({
    query: async () => {
      queryCalls += 1;
      return [];
    },
  }), {
    method: 'GET',
    query: { id: orderId },
  });

  assert.equal(response.statusCode, 404);
  assert.equal(queryCalls, 1);
});
