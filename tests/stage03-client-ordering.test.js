const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const clientPath = path.join(root, 'qr-ordering.js');

function loadClient() {
  delete require.cache[require.resolve(clientPath)];
  return require(clientPath);
}

function storageHarness(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    storage: {
      getItem(key) {
        return values.get(key) ?? null;
      },
      setItem(key, value) {
        values.set(key, String(value));
      },
      removeItem(key) {
        values.delete(key);
      },
    },
  };
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Expected ${name} in HTML source`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'" || char === '`') quote = char;
    else if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

const tokenA = 'table_token_alpha_1234';
const tokenB = 'table_token_bravo_1234';
const tableId = '11111111-1111-4111-8111-111111111111';
const sessionA = '22222222-2222-4222-8222-222222222222';
const sessionB = '33333333-3333-4333-8333-333333333333';
const dishA = '44444444-4444-4444-8444-444444444444';
const dishB = '55555555-5555-4555-8555-555555555555';
const orderId = '66666666-6666-4666-8666-666666666666';

test('Vercel rewrites public and admin routes to their client shells', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.deepEqual(config.rewrites, [
    { source: '/api/:path*', destination: '/api/router?path=:path*' },
    { source: '/t/:token', destination: '/index.html' },
    { source: '/order/:id', destination: '/index.html' },
    { source: '/admin', destination: '/admin.html' },
    { source: '/admin/menu', destination: '/admin.html' },
    { source: '/admin/tables', destination: '/admin.html' },
    { source: '/stats', destination: '/admin.html' },
    { source: '/admin-next', destination: '/admin-dist/index.html' },
    { source: '/admin-next/:path*', destination: '/admin-dist/index.html' },
  ]);
});

test('nested table and order routes resolve every required local asset from the site root', () => {
  for (const file of ['index.html', 'menu.html']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const baseMatch = source.match(/<head>\s*<base href="([^"]+)">/);
    assert.ok(baseMatch, `${file} must declare an explicit document base`);
    const requiredAssets = [
      'qr-ordering.js',
      'fonts/SFProText_Light.woff2',
      'fonts/SFProText_Regular.woff2',
      'fonts/SFProText_Medium.woff2',
      'fonts/SFProText_Bold.woff2',
      'icons/whatsapp-ios.png',
      'icons/messages-ios.png',
      'icons/phone-ios.png',
      'icons/maps-ios.png',
    ];
    for (const route of [`/t/${tokenA}`, `/order/${orderId}`]) {
      const documentBase = new URL(baseMatch[1], `https://menu.example${route}`);
      for (const asset of requiredAssets) {
        assert.match(source, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.equal(new URL(asset, documentBase).pathname, `/${asset}`);
      }
    }
  }
});

test('route parsing accepts only QR table tokens and UUID order IDs', () => {
  const { parseRoute } = loadClient();
  assert.deepEqual(parseRoute(`/t/${tokenA}`), { type: 'table', token: tokenA });
  assert.deepEqual(parseRoute(`/order/${orderId}`), { type: 'order', orderId });
  assert.deepEqual(parseRoute('/'), { type: 'qr-required' });
  assert.deepEqual(parseRoute('/t/bad'), { type: 'qr-required' });
  assert.deepEqual(parseRoute('/order/not-an-id'), { type: 'qr-required' });
  assert.deepEqual(parseRoute('/t/%ZZ'), { type: 'qr-required' });
  assert.deepEqual(parseRoute('/t/%E0%A4%A'), { type: 'qr-required' });
  assert.deepEqual(parseRoute('/order/%ZZ'), { type: 'qr-required' });
});

test('token-namespaced storage never shares carts and clears a changed session', () => {
  const { STORAGE_POINTER_KEY, contextStorageKey, updateTableContext, readCurrentContext } = loadClient();
  const { storage, values } = storageHarness();
  const first = updateTableContext(storage, tokenA, {
    table: { id: tableId, number: '7' },
    session: { id: sessionA, status: 'open', openedAt: '2026-07-27T10:00:00.000Z' },
  });
  first.cart[dishA] = 2;
  first.activeOrderId = orderId;
  storage.setItem(contextStorageKey(tokenA), JSON.stringify(first));

  updateTableContext(storage, tokenB, {
    table: { id: tableId, number: '8' },
    session: { id: sessionB, status: 'open', openedAt: '2026-07-27T10:01:00.000Z' },
  });
  assert.deepEqual(readCurrentContext(storage).cart, {});
  assert.equal(values.get(STORAGE_POINTER_KEY), tokenB);

  const changed = updateTableContext(storage, tokenA, {
    table: { id: tableId, number: '7' },
    session: { id: sessionB, status: 'open', openedAt: '2026-07-27T11:00:00.000Z' },
  });
  assert.deepEqual(changed.cart, {});
  assert.equal(changed.activeOrderId, null);
});

test('order reload recovery requires a valid stored token context', () => {
  const { contextStorageKey, recoverOrderContext, STORAGE_POINTER_KEY } = loadClient();
  const empty = storageHarness().storage;
  assert.equal(recoverOrderContext(empty, orderId), null);

  const saved = {
    token: tokenA,
    tableId,
    tableNumber: '7',
    sessionId: sessionA,
    sessionStatus: 'open',
    cart: {},
    activeOrderId: orderId,
  };
  const { storage } = storageHarness({
    [STORAGE_POINTER_KEY]: tokenA,
    [contextStorageKey(tokenA)]: JSON.stringify(saved),
  });
  assert.deepEqual(recoverOrderContext(storage, orderId), saved);
});

test('storage failures fall back to validated in-memory context without blocking table flow', () => {
  const { updateTableContext, readCurrentContext, writeContext } = loadClient();
  const throwingStorage = {
    getItem() {
      throw new Error('storage denied');
    },
    setItem() {
      throw new Error('storage denied');
    },
  };
  const context = updateTableContext(throwingStorage, tokenA, {
    table: { id: tableId, number: '7' },
    session: { id: sessionA, status: 'open', openedAt: '2026-07-27T10:00:00.000Z' },
  });
  context.cart[dishA] = 2;
  assert.equal(writeContext(throwingStorage, context), true);
  assert.deepEqual(readCurrentContext(throwingStorage), context);
});

test('malformed and wrongly typed stored contexts are ignored', () => {
  const { contextStorageKey, readContext, recoverOrderContext, STORAGE_POINTER_KEY } = loadClient();
  const malformed = storageHarness({
    [STORAGE_POINTER_KEY]: tokenA,
    [contextStorageKey(tokenA)]: '{bad json',
  });
  assert.equal(readContext(malformed.storage, tokenA), null);
  assert.equal(recoverOrderContext(malformed.storage, orderId), null);

  const wrongTypes = storageHarness({
    [STORAGE_POINTER_KEY]: tokenA,
    [contextStorageKey(tokenA)]: JSON.stringify({
      token: tokenA,
      tableId: 123,
      tableNumber: {},
      sessionId: 'not-a-uuid',
      sessionStatus: 42,
      openedAt: [],
      cart: { [dishA]: '2' },
      activeOrderId: orderId,
    }),
  });
  assert.equal(readContext(wrongTypes.storage, tokenA), null);
  assert.equal(recoverOrderContext(wrongTypes.storage, orderId), null);
});

test('API menu maps nested UUID categories and dishes into the visual catalog', () => {
  const { normalizeMenu } = loadClient();
  const menu = normalizeMenu({
    categories: [{
      id: tableId,
      name: 'Роллы',
      dishes: [{
        id: dishA,
        name: 'Филадельфия',
        description: 'Лосось и сыр',
        price: '12.50',
        photoUrl: '/roll.webp',
      }],
    }],
  });
  assert.deepEqual(menu.categories, [{ id: tableId, name: 'Роллы' }]);
  assert.deepEqual(menu.dishes, [{
    id: dishA,
    categoryId: tableId,
    name: 'Филадельфия',
    description: 'Лосось и сыр',
    price: 12.5,
    photoUrl: '/roll.webp',
  }]);
  assert.throws(() => normalizeMenu({
    categories: [{ id: 'legacy', name: 'Old', dishes: [{ id: 1, name: 'Old', price: 1 }] }],
  }), /UUID/);
});

test('API menu text is centrally escaped and photo URLs reject active or breaking schemes', () => {
  const {
    escapeHtmlAttribute,
    escapeHtmlText,
    normalizeMenu,
    normalizePhotoUrl,
  } = loadClient();
  const payload = `<img src=x onerror="alert('x')">&`;
  assert.equal(escapeHtmlText(payload), '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;');
  assert.equal(escapeHtmlAttribute(payload), '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;');
  assert.equal(normalizePhotoUrl('javascript:alert(1)'), null);
  assert.equal(normalizePhotoUrl('data:image/svg+xml,<svg onload=alert(1)>'), null);
  assert.equal(normalizePhotoUrl('//evil.example/x.png'), null);
  assert.equal(normalizePhotoUrl('/safe/menu.png?size=2'), '/safe/menu.png?size=2');
  assert.equal(normalizePhotoUrl('https://cdn.example/menu.png'), 'https://cdn.example/menu.png');

  const menu = normalizeMenu({
    categories: [{
      id: tableId,
      name: payload,
      dishes: [{
        id: dishA,
        name: payload,
        description: '</div><script>alert(1)</script>',
        price: '12.50',
        photoUrl: 'javascript:alert(1)',
      }],
    }],
  });
  assert.equal(menu.categories[0].name, payload);
  assert.equal(menu.dishes[0].name, payload);
  assert.equal(menu.dishes[0].photoUrl, null);
});

test('order body uses the exact snake_case API contract with UUID dish IDs', () => {
  const { buildOrderBody } = loadClient();
  assert.deepEqual(buildOrderBody(sessionA, { [dishA]: 2, [dishB]: 1 }, [
    { id: dishA }, { id: dishB },
  ]), {
    session_id: sessionA,
    items: [
      { dish_id: dishA, quantity: 2 },
      { dish_id: dishB, quantity: 1 },
    ],
  });
});

test('stored cart is pruned to the currently orderable API menu UUIDs', () => {
  const { sanitizeCart } = loadClient();
  assert.deepEqual(sanitizeCart({
    [dishA]: 2,
    [dishB]: 3,
    legacy: 4,
  }, [{ id: dishA }]), { [dishA]: 2 });
});

test('menu preflight blocks POST for disappeared dishes and submits only after reconfirmation', async () => {
  const { submitOrderWithMenuPreflight } = loadClient();
  const oldDishes = [
    { id: dishA, name: 'Филадельфия' },
    { id: dishB, name: 'Чай' },
  ];
  const refreshedPayload = {
    categories: [{
      id: tableId,
      name: 'Роллы',
      dishes: [{
        id: dishA,
        name: 'Филадельфия',
        description: '',
        price: '12.50',
        photoUrl: null,
      }],
    }],
  };
  const posts = [];
  const first = await submitOrderWithMenuPreflight({
    cart: { [dishA]: 1, [dishB]: 2 },
    dishes: oldDishes,
    loadMenu: async () => refreshedPayload,
    submit: async (confirmed) => {
      posts.push(confirmed);
      return { order: { id: orderId } };
    },
  });
  assert.equal(first.kind, 'review-required');
  assert.deepEqual(first.unavailableDishIds, [dishB]);
  assert.deepEqual(first.unavailableNames, ['Чай']);
  assert.deepEqual(first.cart, { [dishA]: 1 });
  assert.equal(posts.length, 0);

  const second = await submitOrderWithMenuPreflight({
    cart: first.cart,
    dishes: first.menu.dishes,
    loadMenu: async () => refreshedPayload,
    submit: async (confirmed) => {
      posts.push(confirmed);
      return { order: { id: orderId } };
    },
  });
  assert.equal(second.kind, 'submitted');
  assert.deepEqual(posts, [{
    cart: { [dishA]: 1 },
    dishes: first.menu.dishes,
  }]);
});

test('menu preflight reports an all-unavailable cart without submitting', async () => {
  const { submitOrderWithMenuPreflight } = loadClient();
  let posts = 0;
  const result = await submitOrderWithMenuPreflight({
    cart: { [dishB]: 2 },
    dishes: [{ id: dishB, name: 'Чай' }],
    loadMenu: async () => ({ categories: [] }),
    submit: async () => {
      posts += 1;
    },
  });
  assert.equal(result.kind, 'review-required');
  assert.equal(result.allUnavailable, true);
  assert.deepEqual(result.cart, {});
  assert.deepEqual(result.unavailableNames, ['Чай']);
  assert.equal(posts, 0);
});

test('closed session resolves the token and retries order creation exactly once', async () => {
  const { submitOrder } = loadClient();
  const calls = [];
  const responses = [
    { status: 409, ok: false, json: async () => ({ error: 'Session is not open' }) },
    { status: 201, ok: true, json: async () => ({ order: { id: orderId, status: 'new' }, excludedDishIds: [] }) },
  ];
  let resolves = 0;
  const result = await submitOrder({
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return responses.shift();
    },
    token: tokenA,
    context: { sessionId: sessionA },
    cart: { [dishA]: 1 },
    dishes: [{ id: dishA, name: 'Филадельфия' }],
    resolveTable: async () => {
      resolves += 1;
      return { session: { id: sessionB, status: 'open' } };
    },
  });
  assert.equal(resolves, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.session_id, sessionA);
  assert.equal(calls[1].body.session_id, sessionB);
  assert.equal(result.kind, 'success');
});

test('unavailable dishes are named and all-unavailable stays an explicit cart result', async () => {
  const { getUnavailableNames, submitOrder } = loadClient();
  assert.deepEqual(getUnavailableNames([dishB], [
    { id: dishA, name: 'Филадельфия' },
    { id: dishB, name: 'Чай' },
  ]), ['Чай']);
  const result = await submitOrder({
    fetchImpl: async () => ({
      status: 409,
      ok: false,
      json: async () => ({ error: 'No requested dishes are available', excludedDishIds: [dishA] }),
    }),
    token: tokenA,
    context: { sessionId: sessionA },
    cart: { [dishA]: 1 },
    dishes: [{ id: dishA, name: 'Филадельфия' }],
    resolveTable: async () => assert.fail('must not resolve a live session for unavailable dishes'),
  });
  assert.deepEqual(result, { kind: 'all-unavailable', excludedDishIds: [dishA] });
});

test('status labels are localized and visibility polling stops when ready', async () => {
  const { STATUS_LABELS, createOrderPoller } = loadClient();
  assert.deepEqual(STATUS_LABELS, {
    new: 'Принят',
    cooking: 'Готовится',
    ready: 'Готово',
  });
  const callbacks = new Map();
  const intervals = [];
  let cleared = 0;
  const documentRef = {
    hidden: false,
    addEventListener(type, callback) {
      callbacks.set(type, callback);
    },
    removeEventListener(type) {
      callbacks.delete(type);
    },
  };
  const statuses = ['cooking', 'ready'];
  const seen = [];
  const poller = createOrderPoller({
    orderId,
    documentRef,
    fetchOrder: async () => ({ id: orderId, status: statuses.shift() }),
    onOrder: (order) => seen.push(order.status),
    setIntervalImpl(callback, delay) {
      intervals.push({ callback, delay });
      return intervals.length;
    },
    clearIntervalImpl() {
      cleared += 1;
    },
  });
  await poller.start();
  assert.equal(intervals[0].delay, 5000);
  await intervals[0].callback();
  assert.deepEqual(seen, ['cooking', 'ready']);
  assert.equal(cleared, 1);

  documentRef.hidden = true;
  callbacks.get('visibilitychange')();
  assert.equal(poller.isRunning(), false);
});

test('destroyed poller ignores an in-flight success and failure', async () => {
  const { createOrderPoller } = loadClient();
  const listeners = new Map();
  const documentRef = {
    hidden: false,
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };
  for (const outcome of ['resolve', 'reject']) {
    let settle;
    const pending = new Promise((resolve, reject) => {
      settle = outcome === 'resolve' ? resolve : reject;
    });
    const orders = [];
    const errors = [];
    let intervals = 0;
    const poller = createOrderPoller({
      orderId,
      documentRef,
      fetchOrder: () => pending,
      onOrder: (order) => orders.push(order),
      onError: (error) => errors.push(error),
      setIntervalImpl() {
        intervals += 1;
        return intervals;
      },
      clearIntervalImpl() {},
    });
    const started = poller.start();
    poller.destroy();
    settle(outcome === 'resolve' ? { id: orderId, status: 'cooking' } : new Error('late'));
    await started;
    assert.deepEqual(orders, []);
    assert.deepEqual(errors, []);
    assert.equal(intervals, 0);
  }
});

test('catalog, product, and cart HTML harness renders malicious API text inert', () => {
  const client = loadClient();
  const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const malicious = `</div><script>alert("x")</script><img src=x onerror=alert(1)>`;
  const item = {
    id: dishA,
    c: tableId,
    n: malicious,
    w: '',
    d: malicious,
    p: 12.5,
    img: '/safe/menu.png?label=%22x%22',
    i: 'utensils',
  };
  const elements = {
    menuArea: { innerHTML: '' },
    prodContent: { innerHTML: '' },
    cartItems: { innerHTML: '' },
    csTotal: { textContent: '' },
    orderBtn: { disabled: false, textContent: '' },
    cartOv: { classList: { contains: () => true } },
  };
  const context = vm.createContext({
    M: [item],
    CN: { [tableId]: malicious },
    cart: { [dishA]: 1 },
    isGrid: true,
    catalogOrderable: true,
    currentQrContext: { token: tokenA },
    orderSubmitting: false,
    document: {
      getElementById(id) {
        return elements[id] || null;
      },
    },
    filtered: () => [item],
    getItem: (id) => (id === dishA ? item : null),
    htmlText: client.escapeHtmlText,
    htmlAttr: client.escapeHtmlAttribute,
    renderDishImage: null,
    cartAddButton: () => '<button type="button">+</button>',
    qtyPriceHtml: () => '<div>12.5 ₸</div>',
    foodIcon: () => '<svg></svg>',
    svgIcon: () => '<svg></svg>',
    trackProductView() {},
    openOv() {},
    fmt: (value) => `${value} ₸`,
    persistQrContext() {},
    updateOrderState() {},
  });
  for (const name of ['renderDishImage', 'render', 'openProd', 'renderCart']) {
    vm.runInContext(`${extractFunction(source, name)};this.${name}=${name};`, context);
  }
  context.render();
  context.openProd(dishA, null);
  context.renderCart();
  function startTags(html) {
    const tags = [];
    for (let index = 0; index < html.length; index += 1) {
      if (html[index] !== '<' || html[index + 1] === '/') continue;
      let quote = null;
      let end = index + 1;
      for (; end < html.length; end += 1) {
        const character = html[end];
        if (quote && character === quote) quote = null;
        else if (!quote && (character === '"' || character === "'")) quote = character;
        else if (!quote && character === '>') break;
      }
      tags.push(html.slice(index, end + 1));
      index = end;
    }
    return tags;
  }
  for (const element of [elements.menuArea, elements.prodContent, elements.cartItems]) {
    for (const tag of startTags(element.innerHTML)) {
      const structure = tag.replace(/"[^"]*"|'[^']*'/g, '""');
      assert.doesNotMatch(structure, /^<script\b|\sonerror\s*=/);
    }
    assert.match(element.innerHTML, /&lt;script&gt;/);
  }
  assert.match(elements.menuArea.innerHTML, /src="\/safe\/menu\.png\?label=%22x%22"/);
});

test('opening the simplified cart works without removed checkout globals', () => {
  const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const calls = [];
  const context = vm.createContext({
    renderCart() {
      calls.push('render');
    },
    openOv(id) {
      calls.push(`open:${id}`);
    },
  });
  vm.runInContext(`${extractFunction(source, 'openCart')};this.openCart=openCart;`, context);

  assert.doesNotThrow(() => context.openCart());
  assert.deepEqual(calls, ['render', 'open:cartOv']);
});

test('live Stage 03 cart and order paths do not reference removed checkout state', () => {
  const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const removedGlobals = /PAYMENT_METHOD_LABELS|delMode|pickupTime|nameInp|phoneInp|addrInp|paymentMethodInp|commentTa/;
  for (const name of [
    'openCart',
    'renderCart',
    'addCart',
    'chQ',
    'clearCart',
    'placeOrder',
    'submitQrOrder',
    'trackCheckoutStarted',
    'initializeTable',
    'showOrderStatus',
    'reorderFromStatus',
  ]) {
    assert.doesNotMatch(extractFunction(source, name), removedGlobals, `${name} uses removed checkout state`);
  }
});

test('reorder route returns to the saved table token without carrying old items', () => {
  const { reorderPath } = loadClient();
  assert.equal(reorderPath({ token: tokenA }), `/t/${tokenA}`);
  assert.equal(reorderPath(null), null);
});

test('client shell requires QR, removes legacy checkout fields, and retains support sharing', () => {
  const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(source, /id="clientState"/);
  assert.match(source, /Для заказа отсканируйте QR-код на столе/);
  assert.match(source, /onclick="openShare\('contact'\)"/);
  assert.match(source, /onclick="openShare\('product'\)"/);
  assert.doesNotMatch(source, /id="(?:nameInp|phoneInp|addrInp|paymentMethodInp|commentTa|pickupTimeOv)"/);
  assert.doesNotMatch(source, /prepareServiceSheet\('order'\)/);
  assert.doesNotMatch(source, /fetch\('ref-products-dom\.json'\)/);
});

test('availability warnings distinguish pre-submit review from the post-submit race fallback', () => {
  const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(source, /Блюда удалены из корзины\. Проверьте заказ и нажмите «Оформить заказ» ещё раз\./);
  assert.match(source, /Заказ уже создан без этих блюд/);
});

test('index.html and menu.html remain byte-identical', () => {
  assert.deepEqual(
    fs.readFileSync(path.join(root, 'index.html')),
    fs.readFileSync(path.join(root, 'menu.html')),
  );
});
