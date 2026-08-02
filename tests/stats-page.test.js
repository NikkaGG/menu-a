const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const html = () => fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const js = () => fs.readFileSync(path.join(root, 'admin.js'), 'utf8');
const response = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const fixture = (overrides = {}) => ({
  range: { from: '2026-07-22', to: '2026-07-28', groupBy: 'day', timeZone: 'Asia/Almaty' },
  totalRevenue: '12500.50', totalProfit: '3500.25',
  points: [{ date: '2026-07-28', revenue: '12500.50', profit: null }],
  topDishes: [{ dish_name: 'Dragon roll', quantity: 4 }], ...overrides,
});

async function harness(fetch, options = {}) {
  const dom = new JSDOM(html(), { url: options.url || 'https://menu.test/stats', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const charts = [];
  window.fetch = fetch;
  window.confirm = () => true;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.Chart = options.chart === false ? undefined : class Chart {
    constructor(canvas, config) { this.canvas = canvas; this.config = config; this.destroyed = false; charts.push(this); }
    destroy() { this.destroyed = true; }
  };
  window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  window.HTMLDialogElement.prototype.close = function close() { this.open = false; };
  window.eval(js());
  await tick(); await tick();
  return { window, document: window.document, charts };
}

async function failingChartHarness(fetch) {
  const dom = new JSDOM(html(), { url: 'https://menu.test/stats', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = fetch;
  window.HTMLCanvasElement.prototype.getContext = () => ({});
  window.Chart = class Chart {
    constructor() { throw new Error('canvas unsupported'); }
  };
  window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  window.HTMLDialogElement.prototype.close = function close() { this.open = false; };
  window.eval(js());
  await tick(); await tick();
  return window.document;
}

test('stats is the third admin destination and canonical rewrite with pinned Chart.js', () => {
  const source = html();
  const links = [...source.matchAll(/data-route="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(links.slice(0, 3), ['menu', 'tables', 'stats']);
  assert.match(source, /href="\/stats" data-route="stats"/);
  assert.match(source, /https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js@4\.4\.9\/dist\/chart\.umd\.min\.js/);
  assert.doesNotMatch(source, /stats_session|\/api\/stats/);
  assert.match(source, /Выручка и прибыль по оформленным заказам/);
  const document = new JSDOM(source).window.document;
  const chartScript = document.querySelector('script[src="https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.min.js"]');
  assert.equal(chartScript.getAttribute('integrity'), 'sha384-b0GXujLkk9eYYSmcSfoyZbfyElGAQnDyY0skCHSG6w3JgTMFnz11ggrTAr7seu9f');
  assert.equal(chartScript.getAttribute('crossorigin'), 'anonymous');
  assert.equal(chartScript.getAttribute('referrerpolicy'), 'no-referrer');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.deepEqual(config.rewrites.find(({ source: route }) => route === '/stats'), { source: '/stats', destination: '/admin-dist/index.html' });
});

test('the legacy stats document redirects to the canonical shared admin dashboard', () => {
  const legacy = fs.readFileSync(path.join(root, 'stats.html'), 'utf8');
  assert.match(legacy, /location\.replace\(['"]\/stats['"]\)/);
  assert.match(legacy, /http-equiv="refresh" content="0;url=\/stats"/i);
  assert.doesNotMatch(legacy, /\/api\/stats|stats_session/);
});

test('pure route and Asia/Almaty preset helpers handle midnight and month boundaries', () => {
  const admin = require('../admin.js');
  assert.equal(admin.routeForPath('/admin'), 'menu');
  assert.equal(admin.routeForPath('/admin/menu'), 'menu');
  assert.equal(admin.routeForPath('/admin/tables'), 'tables');
  assert.equal(admin.routeForPath('/stats'), 'stats');
  assert.deepEqual(admin.statsPresetRange('7', new Date('2026-03-31T19:30:00.000Z')), { from: '2026-03-26', to: '2026-04-01' });
  assert.deepEqual(admin.statsPresetRange('30', new Date('2026-03-31T17:59:59.000Z')), { from: '2026-03-02', to: '2026-03-31' });
  assert.deepEqual(admin.statsPresetRange('month', new Date('2024-03-01T00:00:00.000Z')), { from: '2024-03-01', to: '2024-03-01' });
  assert.deepEqual(admin.statsPresetRange('7', new Date('2024-03-01T00:00:00.000Z')), { from: '2024-02-24', to: '2024-03-01' });
});

test('direct stats load uses admin session and renders KPIs, top five, chart and table fallback', async () => {
  const urls = [];
  const { document, charts } = await harness(async (url) => {
    urls.push(url);
    if (url === '/api/admin/session') return response(200);
    if (url.startsWith('/api/admin/stats?')) return response(200, fixture());
    throw new Error(`Unexpected fetch ${url}`);
  });
  assert.equal(document.querySelector('#stats-page').hidden, false);
  assert.equal(document.querySelector('[data-route="stats"]').getAttribute('aria-current'), 'page');
  assert.ok(urls[1].startsWith('/api/admin/stats?'));
  assert.match(urls[1], /from=\d{4}-\d{2}-\d{2}/);
  assert.match(urls[1], /to=\d{4}-\d{2}-\d{2}/);
  assert.match(urls[1], /groupBy=day/);
  assert.match(document.querySelector('#stats-total-revenue').textContent, /12[\s ]?500,50.*₸/);
  assert.match(document.querySelector('#stats-total-profit').textContent, /3[\s ]?500,25.*₸/);
  assert.match(document.querySelector('#stats-top-dishes').textContent, /Dragon roll/);
  assert.match(document.querySelector('#stats-points-body').textContent, /2026-07-28/);
  assert.equal(charts.length, 1);
  assert.equal(charts[0].config.data.datasets[1].spanGaps, false);
  assert.deepEqual(charts[0].config.data.datasets[1].data, [null]);
});

test('stats navigation uses /stats and popstate restores route content', async () => {
  const { window, document } = await harness(async (url) => {
    if (url === '/api/admin/session') return response(200);
    if (url === '/api/admin/categories') return response(200, { categories: [] });
    if (url === '/api/admin/dishes') return response(200, { dishes: [] });
    if (url.startsWith('/api/admin/stats?')) return response(200, fixture());
    throw new Error(`Unexpected fetch ${url}`);
  }, { url: 'https://menu.test/admin/menu' });
  document.querySelector('[data-route="stats"]').click();
  await tick();
  assert.equal(window.location.pathname, '/stats');
  assert.equal(document.querySelector('#stats-page').hidden, false);
  window.history.pushState({}, '', '/admin/menu');
  window.dispatchEvent(new window.PopStateEvent('popstate'));
  await tick();
  assert.equal(document.querySelector('#menu-page').hidden, false);
});

test('login completion on /stats enters the stats route with the shared admin session', async () => {
  let authenticated = false;
  const { window, document } = await harness(async (url) => {
    if (url === '/api/admin/session') return response(401);
    if (url === '/api/admin/login') { authenticated = true; return response(200); }
    if (url.startsWith('/api/admin/stats?') && authenticated) return response(200, fixture());
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('#login').value = 'admin';
  document.querySelector('#password').value = 'secret';
  document.querySelector('#login-form').dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  await tick(); await tick();
  assert.equal(document.querySelector('#login-view').hidden, true);
  assert.equal(document.querySelector('#stats-page').hidden, false);
  assert.match(document.querySelector('#stats-total-revenue').textContent, /12[\s ]?500,50/);
});

test('custom controls send selected range and group and disable while loading', async () => {
  const pending = deferred();
  const urls = [];
  const { window, document } = await harness(async (url) => {
    if (url === '/api/admin/session') return response(200);
    urls.push(url);
    return urls.length === 1 ? response(200, fixture()) : pending.promise;
  });
  document.querySelector('#stats-from').value = '2026-01-01';
  document.querySelector('#stats-to').value = '2026-01-31';
  document.querySelector('#stats-group-by').value = 'week';
  document.querySelector('#stats-filter-form').dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  assert.equal(document.querySelector('#stats-from').disabled, true);
  assert.match(urls[1], /from=2026-01-01/);
  assert.match(urls[1], /to=2026-01-31/);
  assert.match(urls[1], /groupBy=week/);
  pending.resolve(response(200, fixture()));
  await tick();
  assert.equal(document.querySelector('#stats-from').disabled, false);
});

test('a pending stats load clears the prior range and destroys its chart immediately', async () => {
  const pending = deferred();
  let calls = 0;
  const { document, charts } = await harness(async (url) => {
    if (url === '/api/admin/session') return response(200);
    calls += 1;
    return calls === 1 ? response(200, fixture()) : pending.promise;
  });
  assert.equal(charts.length, 1);
  assert.match(document.querySelector('#stats-total-revenue').textContent, /12[\s ]?500,50/);
  document.querySelector('#stats-reload').click();
  assert.equal(charts[0].destroyed, true);
  assert.equal(document.querySelector('#stats-chart').hidden, true);
  assert.equal(document.querySelector('#stats-total-revenue').textContent, '—');
  assert.equal(document.querySelector('#stats-profit-card').hidden, true);
  assert.equal(document.querySelector('#stats-profit-hint').hidden, true);
  assert.equal(document.querySelector('#stats-points-body').children.length, 0);
  assert.equal(document.querySelector('#stats-top-dishes').children.length, 0);
  assert.match(document.querySelector('#stats-loading').textContent, /Загружаем статистику/);
  pending.resolve(response(200, fixture({ totalRevenue: '25.00' })));
  await tick();
  assert.match(document.querySelector('#stats-total-revenue').textContent, /25,00/);
});

test('stale stats responses cannot replace the latest range', async () => {
  const old = deferred();
  let statsCalls = 0;
  const { window, document } = await harness(async (url) => {
    if (url === '/api/admin/session') return response(200);
    statsCalls += 1;
    return statsCalls === 1 ? old.promise : response(200, fixture({ totalRevenue: '99.00' }));
  });
  document.querySelector('#stats-filter-form').dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  await tick();
  old.resolve(response(200, fixture({ totalRevenue: '1.00' })));
  await tick();
  assert.match(document.querySelector('#stats-total-revenue').textContent, /99,00/);
});

test('retryable stats errors keep authentication, destroy chart, and retry inline', async () => {
  let calls = 0;
  const { document, charts } = await harness(async (url) => {
    if (url === '/api/admin/session') return response(200);
    calls += 1;
    if (calls === 1) return response(200, fixture());
    if (calls === 2) throw new Error('offline');
    return response(200, fixture({ totalRevenue: '44.00' }));
  });
  document.querySelector('#stats-reload').click();
  await tick();
  assert.equal(document.querySelector('#admin-view').hidden, false);
  assert.equal(charts[0].destroyed, true);
  assert.match(document.querySelector('#stats-error').textContent, /Не удалось загрузить статистику/i);
  assert.equal(document.querySelector('#stats-chart').hidden, true);
  document.querySelector('#stats-retry').click();
  await tick();
  assert.match(document.querySelector('#stats-total-revenue').textContent, /44,00/);
});

test('network and API errors clear stale profit and result visibility', async () => {
  const failures = [
    () => { throw new Error('offline'); },
    () => response(400, { error: 'Invalid statistics range' }),
    () => response(500, { error: 'Unable to load statistics' }),
  ];
  for (const fail of failures) {
    let calls = 0;
    const { document } = await harness(async (url) => {
      if (url === '/api/admin/session') return response(200);
      calls += 1;
      return calls === 1 ? response(200, fixture({ totalProfit: null })) : fail();
    });
    assert.equal(document.querySelector('#stats-profit-hint').hidden, false);
    document.querySelector('#stats-reload').click();
    await tick();
    assert.equal(document.querySelector('#stats-profit-card').hidden, true);
    assert.equal(document.querySelector('#stats-profit-hint').hidden, true);
    assert.equal(document.querySelector('#stats-total-revenue').textContent, '—');
    assert.equal(document.querySelector('#stats-total-profit').textContent, '—');
    assert.equal(document.querySelector('#stats-points-body').children.length, 0);
    assert.equal(document.querySelector('#stats-top-dishes').children.length, 0);
    assert.equal(document.querySelector('#stats-empty').hidden, true);
  }
});

test('stats 401 uses the shared quiet login transition', async () => {
  const { document } = await harness(async (url) => {
    if (url === '/api/admin/session') return response(200);
    return response(401, { error: 'Expired' });
  });
  assert.equal(document.querySelector('#admin-view').hidden, true);
  assert.equal(document.querySelector('#login-view').hidden, false);
  assert.equal(document.activeElement, document.querySelector('#login'));
  assert.equal(document.querySelector('#toast-region').children.length, 0);
});

test('missing profit and Chart.js retain useful hint and accessible table fallback', async () => {
  const { document, charts } = await harness(async (url) => {
    if (url === '/api/admin/session') return response(200);
    return response(200, fixture({ totalProfit: null, points: [], topDishes: [] }));
  }, { chart: false });
  assert.equal(charts.length, 0);
  assert.equal(document.querySelector('#stats-profit-card').hidden, true);
  assert.equal(document.querySelector('#stats-profit-hint').hidden, false);
  assert.equal(document.querySelector('#stats-profit-hint a').getAttribute('href'), '/admin/menu');
  assert.match(document.querySelector('#stats-empty').textContent, /статистики нет/i);
  assert.match(document.querySelector('#stats-chart-message').textContent, /График недоступен/i);
});

test('null total profit omits the Chart.js profit dataset entirely', async () => {
  const { charts } = await harness(async (url) => {
    if (url === '/api/admin/session') return response(200);
    return response(200, fixture({ totalProfit: null }));
  });
  assert.deepEqual(Array.from(charts[0].config.data.datasets, ({ label }) => label), ['Выручка']);
});

test('Chart.js rendering failures preserve KPI and accessible table fallback', async () => {
  const document = await failingChartHarness(async (url) => {
    if (url === '/api/admin/session') return response(200);
    return response(200, fixture());
  });
  assert.match(document.querySelector('#stats-total-revenue').textContent, /12[\s ]?500,50/);
  assert.match(document.querySelector('#stats-points-body').textContent, /2026-07-28/);
  assert.match(document.querySelector('#stats-chart-message').textContent, /График недоступен/i);
  assert.equal(document.querySelector('#stats-chart').hidden, true);
  assert.equal(document.querySelector('#stats-error-panel').hidden, true);
});
