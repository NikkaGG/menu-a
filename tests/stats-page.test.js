const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pagePath = path.join(root, 'stats.html');

function source() {
  return fs.readFileSync(pagePath, 'utf8');
}

function makeClassList(initial = []) {
  const values = new Set(initial);
  return {
    add(...names) { names.forEach(name => values.add(name)); },
    remove(...names) { names.forEach(name => values.delete(name)); },
    contains(name) { return values.has(name); },
  };
}

function makeElement(id = '') {
  const listeners = {};
  const attributes = new Map();
  return {
    id,
    value: id === 'days' ? '30' : '',
    className: '',
    classList: makeClassList(id === 'dashboard' ? ['hidden'] : []),
    children: [],
    style: {},
    textContent: '',
    focused: false,
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); },
    addEventListener(type, handler) { listeners[type] = handler; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) || null; },
    focus() { this.focused = true; },
    dispatch(type, event = {}) {
      return listeners[type]({
        preventDefault() {},
        target: this,
        ...event,
      });
    },
  };
}

function statsFixture(overrides = {}) {
  return {
    range: { days: 30, from: '2026-06-25', to: '2026-07-24' },
    kpis: { visits: 0, uniqueVisitors: 0, orders: 0, conversionRate: 0, averageCheck: 0 },
    visitsByDay: [],
    topViewedProducts: [],
    topOrderedProducts: [],
    ordersByHour: [],
    ordersByWeekday: [],
    deliveryMethods: [],
    paymentMethods: [],
    abandonedProducts: [],
    ...overrides,
  };
}

function runPage(fetch) {
  const html = source();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
  const elements = Object.fromEntries(ids.map(id => [id, makeElement(id)]));
  const document = {
    getElementById(id) { return elements[id]; },
    createElement() { return makeElement(); },
  };
  vm.runInNewContext(script, { document, fetch, JSON, Math, String, Error });
  return elements;
}

function response(status, data = statsFixture(), headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return headers[name] || null; } },
    json: async () => data,
  };
}

async function settle() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

test('stats page provides a password login form and logout control', () => {
  const html = source();
  assert.match(html, /id=["']login-form["']/);
  assert.match(html, /type=["']password["']/);
  assert.match(html, /id=["']logout["']/);
  assert.match(html, /Войти/);
});

test('stats page uses session-aware login, stats, and logout API calls', () => {
  const html = source();
  assert.match(html, /fetch\(["']\/api\/stats\/login["']/);
  assert.match(html, /fetch\(`\/api\/stats\?days=\$\{days\}`/);
  assert.match(html, /fetch\(["']\/api\/stats\/logout["']/);
  assert.match(html, /credentials:\s*["']same-origin["']/);
  assert.doesNotMatch(html, /localStorage\.(getItem|setItem)\([^)]*token/i);
  assert.doesNotMatch(html, /sessionStorage\.(getItem|setItem)\([^)]*token/i);
});

test('stats page supports the normative day ranges and required dashboard sections', () => {
  const html = source();
  for (const days of [7, 30, 90]) assert.match(html, new RegExp(`value=["']${days}["']`));
  for (const label of [
    'Визиты', 'Уникальные посетители', 'Заказы', 'Конверсия',
    'Средний чек', 'Визиты по дням', 'Топ просматриваемых товаров',
    'Топ заказываемых товаров', 'Заказы по часам', 'Заказы по дням недели',
    'Доставка и самовывоз', 'Способы оплаты', 'Брошенные товары',
  ]) assert.match(html, new RegExp(label));
});

test('every visual chart has an accessible table fallback and safe rendering primitives', () => {
  const html = source();
  assert.ok((html.match(/<table\b/gi) || []).length >= 7);
  assert.match(html, /textContent/);
  assert.match(html, /createElement/);
  assert.match(html, /role=["']status["']/);
  assert.match(html, /Произошла ошибка загрузки/);
  assert.match(html, /Нет данных/);
  assert.match(html, /401/);
});

test('stats requests preserve the selected day filter', () => {
  const html = source();
  assert.match(html, /\/api\/stats\?days=\$\{days\}/);
  assert.match(html, /data-days/);
});

test('renders payment labels without exposing raw enum values', async () => {
  const data = statsFixture({
    paymentMethods: [
      { method: 'card', orders: 1, share: 20 },
      { method: 'cash', orders: 2, share: 40 },
      { method: 'kaspi_invoice', orders: 2, share: 40 },
    ],
  });
  const elements = runPage(async () => ({ ok: true, status: 200, json: async () => data }));
  await settle();

  const paymentLabels = elements['payment-table'].children.map(row => row.children[0].textContent);
  assert.deepEqual(paymentLabels, ['Оплата картой', 'Оплата наличными', 'Выставить счёт на оплату Kaspi']);
});

test('renders category in top ordered product rows', async () => {
  const data = statsFixture({
    topOrderedProducts: [{ id: 1, name: 'Филадельфия', category: 'Роллы', quantity: 2, orders: 1 }],
  });
  const elements = runPage(async () => ({ ok: true, status: 200, json: async () => data }));
  await settle();

  assert.deepEqual(elements['ordered-table'].children[0].children.map(cell => cell.textContent), ['Филадельфия', 'Роллы', '2', '1']);
  assert.match(source(), /<th>Категория<\/th><th>Количество<\/th>/);
});

test('keeps dashboard visible and reports an error when logout fails', async () => {
  let request = 0;
  const elements = runPage(async () => {
    request += 1;
    if (request === 1) return { ok: true, status: 200, json: async () => statsFixture() };
    return { ok: false, status: 500 };
  });
  await settle();
  await elements.logout.dispatch('click');

  assert.equal(elements.dashboard.classList.contains('hidden'), false);
  assert.equal(elements['login-panel'].classList.contains('hidden'), true);
  assert.equal(elements.status.textContent, 'Не удалось выйти. Попробуйте ещё раз.');
});

test('401 response transitions an authenticated dashboard back to focused login', async () => {
  let request = 0;
  const elements = runPage(async () => {
    request += 1;
    if (request === 1) return { ok: true, status: 200, json: async () => statsFixture() };
    return { ok: false, status: 401 };
  });
  await settle();
  assert.equal(elements.dashboard.classList.contains('hidden'), false);
  await elements.days.dispatch('change', { target: { value: '7' } });
  await settle();

  assert.equal(elements.dashboard.classList.contains('hidden'), true);
  assert.equal(elements['login-panel'].classList.contains('hidden'), false);
  assert.equal(elements.password.focused, true);
});

test('empty response renders zero KPIs and explicit empty rows', async () => {
  const elements = runPage(async () => ({ ok: true, status: 200, json: async () => statsFixture() }));
  await settle();

  assert.equal(elements['kpi-visits'].textContent, '0');
  assert.equal(elements['viewed-table'].children[0].children[0].textContent, 'Нет данных');
  assert.equal(elements.dashboard.classList.contains('hidden'), false);
});

test('initial stats error remains visible on the login panel', async () => {
  const elements = runPage(async () => ({ ok: false, status: 500 }));
  await settle();

  assert.match(elements['login-error'].textContent, /Произошла ошибка загрузки/);
  assert.equal(elements['login-panel'].classList.contains('hidden'), false);
});

test('ignores an older filter response that arrives after a newer response', async () => {
  let firstResolve;
  let request = 0;
  const first = new Promise(resolve => { firstResolve = resolve; });
  const newer = statsFixture({ range: { days: 7, from: '2026-07-18', to: '2026-07-24' } });
  const elements = runPage(() => {
    request += 1;
    return request === 1 ? first : Promise.resolve(response(200, newer));
  });
  await elements.days.dispatch('change', { target: { value: '7' } });
  await settle();
  firstResolve(response(200, statsFixture({ range: { days: 30, from: 'old', to: 'old' } })));
  await settle();

  assert.equal(elements['range-label'].textContent, '2026-07-18 — 2026-07-24');
});

test('focuses the dashboard heading after authenticated load', async () => {
  const elements = runPage(async () => response(200));
  await settle();

  assert.match(source(), /id="dashboard-title"\s+tabindex="-1"/);
  assert.equal(elements['dashboard-title'].focused, true);
});

test('distinguishes wrong password, rate limiting, and service failures', async () => {
  let responseIndex = 0;
  const responses = [response(401), response(401), response(429, statsFixture(), { 'Retry-After': '900' }), response(503)];
  const elements = runPage(async () => responses[responseIndex++]);
  await settle();
  elements.password.value = 'wrong';
  await elements['login-form'].dispatch('submit');
  assert.match(elements['login-error'].textContent, /неверн|парол/i);
  await elements['login-form'].dispatch('submit');
  assert.match(elements['login-error'].textContent, /слишком много|900/i);
  await elements['login-form'].dispatch('submit');
  assert.match(elements['login-error'].textContent, /сервис|недоступ/i);
});

test('reports a login service failure when the network request rejects', async () => {
  let request = 0;
  const elements = runPage(async () => {
    request += 1;
    if (request === 1) return response(401);
    throw new Error('network');
  });
  await settle();
  await elements['login-form'].dispatch('submit');

  assert.equal(elements['login-error'].textContent, 'Сервис статистики временно недоступен.');
});

test('clears password after successful authentication and when returning to login', async () => {
  let request = 0;
  const elements = runPage(async () => {
    request += 1;
    return request === 1 ? response(401) : response(200);
  });
  await settle();
  elements.password.value = 'secret';
  await elements['login-form'].dispatch('submit');
  await settle();
  assert.equal(elements.password.value, '');
  elements.password.value = 'stale';
  await elements.logout.dispatch('click');
  assert.equal(elements.password.value, '');
});

test('renders populated KPI and series fixtures across every dashboard section', async () => {
  const data = statsFixture({
    kpis: { visits: 12, uniqueVisitors: 9, orders: 3, conversionRate: 25, averageCheck: 4500 },
    visitsByDay: [{ date: '2026-07-24', visits: 12, uniqueVisitors: 9 }],
    topViewedProducts: [{ id: 1, name: 'Филадельфия', category: 'Роллы', views: 8 }],
    topOrderedProducts: [{ id: 1, name: 'Филадельфия', category: 'Роллы', quantity: 3, orders: 2 }],
    ordersByHour: [{ hour: 18, orders: 2 }],
    ordersByWeekday: [{ weekday: 5, label: 'Пт', orders: 3 }],
    deliveryMethods: [{ method: 'delivery', orders: 2, share: 66.7 }],
    paymentMethods: [{ method: 'card', orders: 3, share: 100 }],
    abandonedProducts: [{ id: 2, name: 'Калифорния', category: 'Роллы', quantity: 2, visitors: 1 }],
  });
  const elements = runPage(async () => response(200, data));
  await settle();

  assert.equal(elements['kpi-visits'].textContent, '12');
  assert.equal(elements['kpi-unique'].textContent, '9');
  assert.equal(elements['kpi-orders'].textContent, '3');
  assert.equal(elements['kpi-conversion'].textContent, '25%');
  assert.equal(elements['kpi-average'].textContent, '4500 ₸');
  const expectedRows = {
    'visits-table': ['2026-07-24', '12', '9'],
    'viewed-table': ['Филадельфия', 'Роллы', '8'],
    'ordered-table': ['Филадельфия', 'Роллы', '3', '2'],
    'hour-table': ['18:00', '2'],
    'weekday-table': ['Пт', '3'],
    'delivery-table': ['Доставка', '2', '66.7%'],
    'payment-table': ['Оплата картой', '3', '100%'],
    'abandoned-table': ['Калифорния', 'Роллы', '2', '1'],
  };
  for (const [id, expected] of Object.entries(expectedRows)) {
    assert.deepEqual(elements[id].children[0].children.map(cell => cell.textContent), expected);
  }
});

test('successful logout prevents an in-flight stats response from reopening the dashboard', async () => {
  let resolveFilter;
  const pendingFilter = new Promise(resolve => { resolveFilter = resolve; });
  let request = 0;
  const elements = runPage(async () => {
    request += 1;
    if (request === 1) return response(200);
    if (request === 2) return pendingFilter;
    return response(200);
  });
  await settle();
  elements.days.dispatch('change', { target: { value: '7' } });
  await elements.logout.dispatch('click');
  resolveFilter(response(200, statsFixture({ range: { days: 7, from: 'stale', to: 'stale' } })));
  await settle();

  assert.equal(elements.dashboard.classList.contains('hidden'), true);
  assert.equal(elements['login-panel'].classList.contains('hidden'), false);
});
