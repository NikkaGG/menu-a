const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');
const jsQR = require('jsqr');
const { PNG } = require('pngjs');

const root = path.join(__dirname, '..');
const categoryId = '10000000-0000-4000-8000-000000000008';
const sushiId = '20000000-0000-4000-8000-000000000008';
const teaId = '20000000-0000-4000-8000-000000000009';
const tableToken = 'stage08-fixed-token';
const kitchenMessageId = 808001;
const waiterMessageId = 808002;
const secondKitchenMessageId = 808003;
const botInternalSecret = 'stage08-bot-integration-secret-00000001';
const authorize = async () => true;

function migration(name) {
  return fs.readFileSync(path.join(root, 'sql', name), 'utf8');
}

function decodeQr(pngBuffer) {
  const image = PNG.sync.read(pngBuffer);
  const decoded = jsQR(
    new Uint8ClampedArray(image.data),
    image.width,
    image.height,
  );
  assert.ok(decoded, 'QR PNG must decode');
  return decoded.data;
}

function serializable(value) {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializable);
  if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, serializable(child)]),
    );
  }
  return value;
}

function handlerDatabaseValue(value, fieldName) {
  if (value !== null
    && /^(?:telegram_message_id|waiter_message_id)$/.test(fieldName)
    && (typeof value === 'number' || typeof value === 'bigint')) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((child) => handlerDatabaseValue(child, fieldName));
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, handlerDatabaseValue(child, key)]),
    );
  }
  return serializable(value);
}

function responseHarness() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    chunks: [],
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = String(value);
      return this;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = serializable(value);
      return this;
    },
    write(value) {
      this.chunks.push(Buffer.isBuffer(value) ? value : Buffer.from(String(value)));
      return true;
    },
    end(value) {
      if (value !== undefined) this.write(value);
      if (this.chunks.length) this.body = Buffer.concat(this.chunks);
      return this;
    },
    send(value) {
      return this.end(value);
    },
  };
}

async function invoke(handler, request) {
  const response = responseHarness();
  await handler({ headers: {}, ...request }, response);
  return response;
}

function expectStatus(response, statusCode) {
  assert.equal(
    response.statusCode,
    statusCode,
    `expected ${statusCode}, received ${response.statusCode}: ${JSON.stringify(response.body)}`,
  );
  return response.body;
}

function expectNewOrderPayload(order, expected) {
  assert.match(order.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  assert.deepEqual(order, {
    id: expected.id,
    sessionId: expected.sessionId,
    status: 'new',
    total: expected.total,
    createdAt: order.createdAt,
    items: expected.items,
    table: { number: '8' },
  });
}

test('Stage08 Python discovery honors explicit interpreter first', () => {
  const calls = [];
  const selected = botPython({
    environment: { STAGE08_PYTHON: 'explicit-python' },
    probe: (candidate) => {
      calls.push(candidate);
      return { status: candidate === 'explicit-python' ? 0 : null };
    },
  });
  assert.equal(selected, 'explicit-python');
  assert.deepEqual(calls, ['explicit-python']);
});

test('Stage08 Python discovery falls back cross-platform and fails loudly', () => {
  const calls = [];
  const selected = botPython({
    environment: {},
    probe: (candidate) => {
      calls.push(candidate);
      return { status: candidate === 'python3' ? 0 : null };
    },
  });
  assert.equal(selected, 'python3');
  assert.deepEqual(calls, [
    path.join(root, 'bot', '.venv', 'Scripts', 'python.exe'),
    path.join(root, 'bot', '.venv', 'bin', 'python'),
    'python3',
  ]);

  assert.throws(
    () => botPython({ environment: {}, probe: () => ({ status: null }) }),
    /Install bot\/requirements\.txt in bot\/\.venv or set STAGE08_PYTHON/,
  );
});

function botPython({
  environment = process.env,
  probe = spawnSync,
} = {}) {
  const candidates = [
    environment.STAGE08_PYTHON,
    path.join(root, 'bot', '.venv', 'Scripts', 'python.exe'),
    path.join(root, 'bot', '.venv', 'bin', 'python'),
    'python3',
    'python',
  ].filter(Boolean);
  const uniqueCandidates = [...new Set(candidates)];
  for (const candidate of uniqueCandidates) {
    try {
      const availability = probe(candidate, [
        '-c',
        'import aiogram, aiohttp',
      ], {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true,
      });
      if (availability?.status === 0) return candidate;
    } catch {}
  }
  throw new Error(
    'Stage08 Python setup unavailable. Install bot/requirements.txt in bot/.venv or set STAGE08_PYTHON.',
  );
}

function runBotDriver(python, mode, payload, bridgeUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [
      path.join(root, 'bot', 'tests', 'stage08_driver.py'),
      mode,
    ], {
      cwd: root,
      env: {
        ...process.env,
        STAGE08_BRIDGE_URL: bridgeUrl,
        STAGE08_BOT_SECRET: botInternalSecret,
        PYTHONPATH: [root, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Stage08 Python driver timed out in ${mode}`));
    }, 15000);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const detail = stderr
          .replaceAll(botInternalSecret, '[redacted]')
          .trim()
          .slice(-1000);
        reject(new Error(`Stage08 Python driver failed in ${mode}: ${detail}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Stage08 Python driver returned invalid JSON in ${mode}`));
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

function requestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      if (!chunks.length) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function nodeResponse(response) {
  return {
    statusCode: 200,
    setHeader(name, value) {
      response.setHeader(name, value);
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      response.statusCode = this.statusCode;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(serializable(value)));
      return this;
    },
    end(value) {
      response.statusCode = this.statusCode;
      response.end(value);
      return this;
    },
  };
}

async function startBotBridge(query) {
  const { createBotAuthorizer } = require('../api/_lib/bot-auth');
  const botAuthorize = createBotAuthorizer({
    env: { BOT_INTERNAL_API_SECRET: botInternalSecret },
  });
  const factories = {
    order: require('../api/orders/[id]').createOrderDetailsHandler({ query }),
    status: require('../api/orders/[id]/status').createOrderStatusHandler({
      query,
      authorize: botAuthorize,
    }),
    telegram: require('../api/orders/[id]/telegram-message').createTelegramMessageHandler({
      query,
      authorize: botAuthorize,
    }),
    claim: require('../api/orders/[id]/waiter-notification-claim')
      .createWaiterNotificationClaimHandler({ query, authorize: botAuthorize }),
    waiter: require('../api/orders/[id]/waiter-message').createWaiterMessageHandler({
      query,
      authorize: botAuthorize,
    }),
    bill: require('../api/sessions/[id]/bill').createBillHandler({
      query,
      authorize: botAuthorize,
    }),
    close: require('../api/sessions/[id]/close').createCloseSessionHandler({
      query,
      authorize: botAuthorize,
    }),
  };
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      const routes = [
        [/^\/api\/orders\/([^/]+)$/, factories.order],
        [/^\/api\/orders\/([^/]+)\/status$/, factories.status],
        [/^\/api\/orders\/([^/]+)\/telegram-message$/, factories.telegram],
        [/^\/api\/orders\/([^/]+)\/waiter-notification-claim$/, factories.claim],
        [/^\/api\/orders\/([^/]+)\/waiter-message$/, factories.waiter],
        [/^\/api\/sessions\/([^/]+)\/bill$/, factories.bill],
        [/^\/api\/sessions\/([^/]+)\/close$/, factories.close],
      ];
      const route = routes
        .map(([pattern, handler]) => ({ match: pattern.exec(url.pathname), handler }))
        .find(({ match }) => match);
      if (!route) {
        response.statusCode = 404;
        response.end();
        return;
      }
      await route.handler({
        method: request.method,
        headers: request.headers,
        query: { id: route.match[1] },
        body: await requestBody(request),
      }, nodeResponse(response));
    } catch {
      if (!response.headersSent) {
        response.statusCode = 500;
        response.setHeader('Content-Type', 'application/json');
      }
      response.end(JSON.stringify({ error: 'bridge_failure' }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(address.address, '127.0.0.1');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

test('Stage08 stateful restaurant flow crosses production handler boundaries', async (t) => {
  const python = botPython();
  const database = new PGlite({ extensions: { pgcrypto } });
  t.after(() => database.close());

  await database.exec(migration('002_restaurant_ordering.sql'));
  await database.exec(migration('004_orders_created_at_index.sql'));
  await database.exec(migration('005_orders_waiter_message_id.sql'));
  await database.exec(`
    INSERT INTO categories (id, name, sort_order)
    VALUES ('${categoryId}', 'Stage08 menu', 1);

    INSERT INTO dishes
      (id, category_id, name, description, price, cost_price, is_available, sort_order)
    VALUES
      ('${sushiId}', '${categoryId}', 'Sushi Roll', 'Eight pieces', 12.50, 7.50, TRUE, 1),
      ('${teaId}', '${categoryId}', 'Tea', NULL, 5.00, 2.00, TRUE, 2);
  `);

  const query = async (sql, values = []) => {
    const result = await database.query(sql, values);
    return handlerDatabaseValue(result.rows);
  };

  const { createTablesHandler } = require('../api/admin/tables/index');
  const { createTableQrHandler } = require('../api/admin/tables/[id]/qr');
  const { createTableHandler } = require('../api/tables/[token]');
  const { createMenuHandler } = require('../api/menu');
  const { createOrderHandler } = require('../api/orders');
  const { createOrderDetailsHandler } = require('../api/orders/[id]');
  const { createBillHandler } = require('../api/sessions/[id]/bill');
  const { createDishHandler } = require('../api/admin/dishes/[id]');
  const { createAdminStatsHandler } = require('../api/admin/stats');

  const tablesHandler = createTablesHandler({
    query,
    authorize,
    generateToken: () => tableToken,
  });
  const createdTable = expectStatus(await invoke(tablesHandler, {
    method: 'POST',
    body: { number: '8' },
  }), 201).table;
  assert.equal(createdTable.token, tableToken);

  const qrResponse = await invoke(createTableQrHandler({
    query,
    authorize,
    env: { APP_URL: 'https://menu.example///', NODE_ENV: 'production' },
  }), {
    method: 'GET',
    query: { id: createdTable.id },
  });
  expectStatus(qrResponse, 200);
  assert.equal(qrResponse.headers['content-type'], 'image/png');
  assert.equal(qrResponse.headers['cache-control'], 'private, no-store');
  assert.equal(
    qrResponse.headers['content-disposition'],
    'attachment; filename="table-8.png"',
  );
  const decodedQrUrl = decodeQr(qrResponse.body);
  assert.equal(decodedQrUrl, `https://menu.example/t/${tableToken}`);
  const scannedToken = new URL(decodedQrUrl).pathname.split('/').at(-1);
  assert.equal(scannedToken, tableToken);

  const resolveTable = createTableHandler({ query });
  const firstResolution = expectStatus(await invoke(resolveTable, {
    method: 'GET',
    query: { token: scannedToken },
  }), 200);
  assert.equal(firstResolution.table.id, createdTable.id);
  assert.equal(firstResolution.session.status, 'open');
  const oldSessionId = firstResolution.session.id;

  const menuHandler = createMenuHandler({ query });
  const initialMenu = expectStatus(await invoke(menuHandler, {
    method: 'GET',
  }), 200);
  assert.deepEqual(
    initialMenu.categories.flatMap((category) => category.dishes.map((dish) => dish.id)),
    [sushiId, teaId],
  );

  const secondResolution = expectStatus(await invoke(resolveTable, {
    method: 'GET',
    query: { token: tableToken },
  }), 200);
  assert.equal(secondResolution.session.id, oldSessionId);

  const notifications = [];
  const orderHandler = createOrderHandler({
    query,
    notify: async (order) => notifications.push({ order }),
  });
  const firstOrderResponse = await invoke(orderHandler, {
    method: 'POST',
    body: {
      session_id: oldSessionId,
      items: [{ dish_id: sushiId, quantity: 2 }],
    },
  });
  const firstOrderBody = expectStatus(firstOrderResponse, 201);
  const firstOrder = firstOrderBody.order;
  expectNewOrderPayload(firstOrder, {
    id: firstOrder.id,
    sessionId: oldSessionId,
    total: '25.00',
    items: [{
      dishId: sushiId,
      dishName: 'Sushi Roll',
      dishPrice: '12.50',
      quantity: 2,
      subtotal: '25.00',
    }],
  });
  assert.deepEqual(firstOrderBody.excludedDishIds, []);
  assert.deepEqual(notifications, [{ order: firstOrder }]);

  const bridge = await startBotBridge(query);
  t.after(() => bridge.close());
  const intake = await runBotDriver(python, 'intake', {
    notification: notifications[0],
    kitchenMessageId,
    waiterMessageId,
  }, bridge.url);
  assert.deepEqual(intake, {
    mode: 'intake',
    orderId: firstOrder.id,
    messageId: kitchenMessageId,
    button: `order:cooking:${firstOrder.id}`,
    cardAccepted: true,
  });
  const kitchenMessage = await query(
    'SELECT telegram_message_id FROM orders WHERE id = $1',
    [firstOrder.id],
  );
  assert.deepEqual(kitchenMessage, [{ telegram_message_id: String(kitchenMessageId) }]);

  const orderDetails = createOrderDetailsHandler({ query });
  const initialDetails = expectStatus(await invoke(orderDetails, {
    method: 'GET',
    query: { id: firstOrder.id },
  }), 200);
  assert.equal(initialDetails.order.status, 'new');

  const transition = await runBotDriver(python, 'transition', {
    orderId: firstOrder.id,
    sessionId: oldSessionId,
    kitchenMessageId,
    waiterMessageId,
  }, bridge.url);
  assert.deepEqual(transition, {
    mode: 'transition',
    orderId: firstOrder.id,
    statuses: ['cooking', 'ready'],
    readyButton: `order:ready:${firstOrder.id}`,
    billButton: `bill:${oldSessionId}`,
    waiterMessageId,
  });
  const finalDetails = expectStatus(await invoke(orderDetails, {
    method: 'GET',
    query: { id: firstOrder.id },
  }), 200);
  assert.equal(finalDetails.order.status, 'ready');
  const persistedMessages = await query(
    'SELECT telegram_message_id, waiter_message_id FROM orders WHERE id = $1',
    [firstOrder.id],
  );
  assert.deepEqual(persistedMessages, [{
    telegram_message_id: String(kitchenMessageId),
    waiter_message_id: String(waiterMessageId),
  }]);

  const sameSessionAgain = expectStatus(await invoke(resolveTable, {
    method: 'GET',
    query: { token: tableToken },
  }), 200);
  assert.equal(sameSessionAgain.session.id, oldSessionId);

  const secondOrderBody = expectStatus(await invoke(orderHandler, {
    method: 'POST',
    body: {
      session_id: oldSessionId,
      items: [
        { dish_id: sushiId, quantity: 1 },
        { dish_id: teaId, quantity: 3 },
      ],
    },
  }), 201);
  const secondOrder = secondOrderBody.order;
  expectNewOrderPayload(secondOrder, {
    id: secondOrder.id,
    sessionId: oldSessionId,
    total: '27.50',
    items: [
      {
        dishId: sushiId,
        dishName: 'Sushi Roll',
        dishPrice: '12.50',
        quantity: 1,
        subtotal: '12.50',
      },
      {
        dishId: teaId,
        dishName: 'Tea',
        dishPrice: '5.00',
        quantity: 3,
        subtotal: '15.00',
      },
    ],
  });
  assert.equal(notifications.length, 2);
  assert.deepEqual(notifications[1], { order: secondOrder });
  const secondIntake = await runBotDriver(python, 'intake', {
    notification: notifications[1],
    kitchenMessageId: secondKitchenMessageId,
    waiterMessageId: waiterMessageId + 1,
  }, bridge.url);
  assert.deepEqual(secondIntake, {
    mode: 'intake',
    orderId: secondOrder.id,
    messageId: secondKitchenMessageId,
    button: `order:cooking:${secondOrder.id}`,
    cardAccepted: true,
  });
  const secondKitchenMessage = await query(
    'SELECT telegram_message_id FROM orders WHERE id = $1',
    [secondOrder.id],
  );
  assert.deepEqual(secondKitchenMessage, [{
    telegram_message_id: String(secondKitchenMessageId),
  }]);

  const billHandler = createBillHandler({ query, authorize });
  const oldOpenBill = expectStatus(await invoke(billHandler, {
    method: 'GET',
    query: { id: oldSessionId },
  }), 200);
  assert.equal(oldOpenBill.orders.length, 2);
  assert.deepEqual(
    new Set(oldOpenBill.orders.map((order) => order.id)),
    new Set([firstOrder.id, secondOrder.id]),
  );
  assert.equal(oldOpenBill.total, '52.50');

  const closed = await runBotDriver(python, 'waiter-close', {
    sessionId: oldSessionId,
    kitchenMessageId,
    waiterMessageId,
    expectedTotal: '52.50',
  }, bridge.url);
  assert.deepEqual(closed, {
    mode: 'waiter-close',
    sessionId: oldSessionId,
    total: '52.50',
    closeButton: `close:${oldSessionId}`,
    confirmationShown: true,
    closed: true,
  });

  const newResolution = expectStatus(await invoke(resolveTable, {
    method: 'GET',
    query: { token: tableToken },
  }), 200);
  const newSessionId = newResolution.session.id;
  assert.notEqual(newSessionId, oldSessionId);
  assert.equal(newResolution.session.status, 'open');

  const oldClosedBill = expectStatus(await invoke(billHandler, {
    method: 'GET',
    query: { id: oldSessionId },
  }), 200);
  assert.equal(oldClosedBill.session.status, 'closed');
  assert.equal(oldClosedBill.orders.length, 2);
  assert.equal(oldClosedBill.total, '52.50');

  const newEmptyBill = expectStatus(await invoke(billHandler, {
    method: 'GET',
    query: { id: newSessionId },
  }), 200);
  assert.equal(newEmptyBill.session.status, 'open');
  assert.deepEqual(newEmptyBill.orders, []);
  assert.equal(newEmptyBill.total, '0.00');

  const unavailableDish = expectStatus(await invoke(createDishHandler({
    query,
    authorize,
  }), {
    method: 'PATCH',
    query: { id: teaId },
    body: { is_available: false },
  }), 200);
  assert.equal(unavailableDish.dish.isAvailable, false);

  const updatedMenu = expectStatus(await invoke(menuHandler, {
    method: 'GET',
  }), 200);
  const updatedDishIds = updatedMenu.categories
    .flatMap((category) => category.dishes.map((dish) => dish.id));
  assert.deepEqual(updatedDishIds, [sushiId]);
  assert.equal(updatedDishIds.includes(teaId), false);

  const rejectedUnavailableOrder = expectStatus(await invoke(orderHandler, {
    method: 'POST',
    body: {
      session_id: newSessionId,
      items: [{ dish_id: teaId, quantity: 1 }],
    },
  }), 409);
  assert.deepEqual(rejectedUnavailableOrder, {
    error: 'No requested dishes are available',
    excludedDishIds: [teaId],
  });

  await database.query(
    `UPDATE orders
     SET created_at = $1::timestamptz
     WHERE id = ANY($2::uuid[])`,
    ['2026-07-28T06:00:00.000Z', [firstOrder.id, secondOrder.id]],
  );
  const stats = expectStatus(await invoke(createAdminStatsHandler({
    query,
    authorize,
  }), {
    method: 'GET',
    query: { from: '2026-07-28', to: '2026-07-28', groupBy: 'day' },
  }), 200);
  assert.equal(stats.totalRevenue, '52.50');
  assert.equal(stats.totalProfit, '24.00');
  assert.deepEqual(stats.points, [{
    date: '2026-07-28',
    revenue: '52.50',
    profit: '24.00',
  }]);
  assert.deepEqual(stats.topDishes, [
    { dish_name: 'Sushi Roll', quantity: 3 },
    { dish_name: 'Tea', quantity: 3 },
  ]);

  const persisted = await query(
    `SELECT telegram_message_id, waiter_message_id
     FROM orders
     WHERE id = $1`,
    [firstOrder.id],
  );
  assert.deepEqual(persisted, [{
    telegram_message_id: String(kitchenMessageId),
    waiter_message_id: String(waiterMessageId),
  }]);
});
