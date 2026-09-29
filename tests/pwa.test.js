const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PNG } = require('pngjs');

const root = path.join(__dirname, '..');

test('install manifest points to usable PNG icons and a standalone root scope', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.start_url, '/');
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    const png = PNG.sync.read(fs.readFileSync(path.join(root, icon.src.slice(1))));
    assert.equal(`${png.width}x${png.height}`, icon.sizes);
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /rel="manifest" href="\/manifest.webmanifest"/);
  assert.match(html, /navigator\.serviceWorker\.register\('\/sw\.js'\)/);
});

test('service worker never intercepts live APIs and restores QR/order shells offline', async () => {
  const handlers = new Map();
  const contents = new Map();
  const cache = {
    addAll: async (urls) => urls.forEach((url) => contents.set(url, { url })),
    match: async (request) => contents.get(typeof request === 'string' ? request : new URL(request.url).pathname),
    put: async (request, response) => contents.set(new URL(request.url).pathname, response),
  };
  let online = true;
  const scope = {
    self: {
      location: { origin: 'https://menu.example' },
      addEventListener: (type, listener) => handlers.set(type, listener),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      open: async () => cache,
      keys: async () => ['sushi-crazy-shell-v1'],
      delete: async () => true,
      match: cache.match,
    },
    fetch: async (request) => {
      if (!online) throw new Error('offline');
      return { ok: true, url: request.url, clone() { return this; } };
    },
    URL,
    Response: { error: () => ({ error: true }) },
    Promise,
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), scope);
  await new Promise((resolve) => handlers.get('install')({ waitUntil: (promise) => promise.then(resolve) }));
  function dispatch(url, mode = 'cors') {
    let response;
    handlers.get('fetch')({
      request: { url: `https://menu.example${url}`, method: 'GET', mode },
      respondWith(promise) { response = promise; },
      waitUntil() {},
    });
    return response;
  }
  for (const url of ['/api/menu', '/api/orders/abc', '/api/tables/token', '/api/admin/session']) {
    assert.equal(dispatch(url), undefined, `${url} must use the network`);
  }
  online = false;
  assert.deepEqual(await dispatch('/t/fixed-token', 'navigate'), { url: '/index.html' });
  assert.deepEqual(await dispatch('/order/fixed-id', 'navigate'), { url: '/index.html' });
});
