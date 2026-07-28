const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const html = () => fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const css = () => fs.readFileSync(path.join(root, 'admin.css'), 'utf8');
const js = () => fs.readFileSync(path.join(root, 'admin.js'), 'utf8');

const response = (status, body, extras = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  blob: async () => extras.blob || new Blob(['qr']),
  headers: { get: (name) => extras.headers && extras.headers[name] || null },
});

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function harness(fetch) {
  const dom = new JSDOM(html(), {
    url: 'https://menu.test/admin/menu',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.fetch = fetch;
  window.confirm = () => true;
  window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  window.HTMLDialogElement.prototype.close = function close() { this.open = false; };
  const nativeAnchorClick = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function click() {
    if (this.hasAttribute('data-route')) nativeAnchorClick.call(this);
    else this.dataset.clicked = 'true';
  };
  window.eval(js());
  await tick();
  await tick();
  return { dom, window, document: window.document };
}

test('admin shell and rewrites exist', () => {
  assert.match(html(), /<main[^>]+id="app"/i);
  assert.match(html(), /admin\.css/);
  assert.match(html(), /admin\.js/);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.deepEqual(config.rewrites.slice(-4), [
    { source: '/admin', destination: '/admin.html' },
    { source: '/admin/menu', destination: '/admin.html' },
    { source: '/admin/tables', destination: '/admin.html' },
    { source: '/stats', destination: '/admin.html' },
  ]);
});

test('admin source contains safe auth gate and all requested form fields', () => {
  assert.match(html(), /id="login-form"/);
  for (const field of ['login', 'password', 'category-name', 'dish-name', 'dish-description',
    'dish-price', 'dish-cost-price', 'dish-photo-url', 'dish-category', 'dish-sort-order',
    'table-number']) assert.match(html(), new RegExp(`id="${field}"`));
  assert.match(html(), /выручка и прибыль/i);
  assert.match(html(), /сесси/i);
  assert.match(html(), /id="dish-photo-url" type="text"/);
});

test('admin interface and API errors are localized in Russian', () => {
  const source = html();
  assert.match(source, /<html lang="ru">/);
  for (const phrase of [
    'Панель ресторана',
    'Управление меню',
    'Столы и QR-коды',
    'Статистика',
    'Добавить блюдо',
    'Добавить стол',
    'Войти',
  ]) {
    assert.match(source, new RegExp(phrase));
  }
  for (const phrase of [
    'Welcome back',
    'Add dish',
    'Add table',
    'Total revenue',
    'Save dish',
  ]) {
    assert.doesNotMatch(source, new RegExp(phrase));
  }

  const admin = require('../admin.js');
  assert.equal(
    admin.translateApiError('Category is in use'),
    'Категория используется и не может быть удалена.',
  );
  assert.equal(
    admin.translateApiError('Unexpected server response'),
    'Не удалось выполнить действие. Попробуйте ещё раз.',
  );
});

test('login network failures remain localized in Russian', async () => {
  const { document } = await harness((url) => {
    if (url === '/api/admin/session') return Promise.resolve(response(401, {}));
    if (url === '/api/admin/login') return Promise.reject(new Error('Failed to fetch'));
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('#login').value = 'admin';
  document.querySelector('#password').value = 'secret';
  document.querySelector('#login-form').requestSubmit();
  await tick();
  assert.match(document.querySelector('#login-error').textContent, /Не удалось выполнить вход/);
});

test('login service failures are not presented as invalid credentials', async () => {
  const { document } = await harness((url) => {
    if (url === '/api/admin/session') return Promise.resolve(response(401, {}));
    if (url === '/api/admin/login') return Promise.resolve(response(503, { error: 'Unable to sign in' }));
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('#login').value = 'admin';
  document.querySelector('#password').value = 'secret';
  document.querySelector('#login-form').requestSubmit();
  await tick();
  assert.equal(document.querySelector('#login-error').textContent, 'Не удалось выполнить вход. Попробуйте позже.');
});

test('admin UI uses DOM APIs rather than unsafe HTML sinks and supports accessible responsive states', () => {
  assert.doesNotMatch(js(), /\.innerHTML\s*=/);
  assert.doesNotMatch(js(), /insertAdjacentHTML/);
  assert.match(js(), /URLSearchParams|location\.pathname/);
  assert.match(html(), /aria-live="polite"/);
  assert.match(html(), /role="dialog"/);
  assert.match(css(), /@media/);
  assert.match(css(), /prefers-reduced-motion/);
  assert.match(js(), /method: 'PATCH'.+is_available/s);
  assert.match(js(), /response\.blob\(\)/);
  assert.match(js(), /URL\.createObjectURL/);
  assert.match(js(), /root\.confirm/);
});

test('admin pure helpers validate photos and group sorted catalog data', () => {
  const admin = require('../admin.js');
  assert.equal(admin.normalizePhotoUrl('javascript:alert(1)'), null);
  assert.equal(admin.normalizePhotoUrl('//evil.example/x'), null);
  assert.equal(admin.normalizePhotoUrl('/safe.png'), '/safe.png');
  assert.equal(admin.normalizePhotoUrl('https://cdn.example/safe.png'), 'https://cdn.example/safe.png');
  const grouped = admin.groupCatalog(
    [{ id: 'b', name: 'B', sortOrder: 2 }, { id: 'a', name: 'A', sortOrder: 1 }],
    [{ id: 'd2', categoryId: 'b', sortOrder: 1, name: 'Second' }, { id: 'd1', categoryId: 'b', sortOrder: 0, name: 'First' }],
  );
  assert.deepEqual(grouped.map((item) => item.category.id), ['a', 'b']);
  assert.deepEqual(grouped[1].dishes.map((dish) => dish.id), ['d1', 'd2']);
});

test('category save ignores double submit and preserves its dialog with an inline error', async () => {
  const save = deferred();
  let saves = 0;
  const { window, document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories' && options.method === 'POST') { saves += 1; return save.promise; }
    if (url === '/api/admin/categories') return Promise.resolve(response(200, { categories: [] }));
    if (url === '/api/admin/dishes') return Promise.resolve(response(200, { dishes: [] }));
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('#new-category-button').click();
  document.querySelector('#category-name').value = 'Lunch';
  const form = document.querySelector('#category-form');
  form.dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  form.dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  assert.equal(saves, 1);
  const submit = form.querySelector('button[type="submit"]');
  assert.equal(submit.disabled, true);
  save.resolve(response(500, { error: 'Save failed' }));
  await tick();
  assert.equal(document.querySelector('#editor-dialog').open, true);
  assert.equal(document.querySelector('#category-form-error').textContent, 'Не удалось выполнить действие. Попробуйте ещё раз.');
  assert.equal(submit.disabled, false);
});

test('a late category save cannot overwrite or close a newly opened editor', async () => {
  const save = deferred();
  const categories = [
    { id: 'c1', name: 'First', sortOrder: 0 },
    { id: 'c2', name: 'Second', sortOrder: 1 },
  ];
  const { window, document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return Promise.resolve(response(200, { categories }));
    if (url === '/api/admin/dishes') return Promise.resolve(response(200, { dishes: [] }));
    if (url === '/api/admin/categories/c1' && options.method === 'PATCH') return save.promise;
    throw new Error(`Unexpected fetch ${url}`);
  });
  const editors = document.querySelectorAll('.category-head button:first-of-type');
  editors[0].click();
  document.querySelector('#category-name').value = 'First saved';
  document.querySelector('#category-form').dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  document.querySelector('#category-form .close-dialog').click();
  editors[1].click();
  save.resolve(response(200, { category: { id: 'c1', name: 'First saved', sortOrder: 0 } }));
  await tick();
  assert.equal(document.querySelector('#editor-dialog').open, true);
  assert.equal(document.querySelector('#category-name').value, 'Second');
  assert.match(document.querySelector('#menu-content').textContent, /First saved/);
  assert.match(document.querySelector('#menu-content').textContent, /Second/);
});

test('a late dish save cannot overwrite or close a newly opened editor', async () => {
  const save = deferred();
  const dishes = [
    { id: 'd1', categoryId: 'c1', name: 'First dish', price: 8, sortOrder: 0, isAvailable: true },
    { id: 'd2', categoryId: 'c1', name: 'Second dish', price: 9, sortOrder: 1, isAvailable: true },
  ];
  const { window, document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return Promise.resolve(response(200, { categories: [{ id: 'c1', name: 'Food', sortOrder: 0 }] }));
    if (url === '/api/admin/dishes') return Promise.resolve(response(200, { dishes }));
    if (url === '/api/admin/dishes/d1' && options.method === 'PATCH') return save.promise;
    throw new Error(`Unexpected fetch ${url}`);
  });
  const editors = document.querySelectorAll('.dish-row .row-actions button:first-child');
  editors[0].click();
  document.querySelector('#dish-name').value = 'First saved';
  document.querySelector('#dish-form').dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  document.querySelector('#dish-form .close-dialog').click();
  editors[1].click();
  save.resolve(response(200, { dish: { ...dishes[0], name: 'First saved' } }));
  await tick();
  assert.equal(document.querySelector('#editor-dialog').open, true);
  assert.equal(document.querySelector('#dish-name').value, 'Second dish');
  assert.match(document.querySelector('#menu-content').textContent, /First saved/);
  assert.match(document.querySelector('#menu-content').textContent, /Second dish/);
});

test('a late table save cannot close a newly opened editor', async () => {
  const save = deferred();
  const { window, document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return Promise.resolve(response(200, { categories: [] }));
    if (url === '/api/admin/dishes') return Promise.resolve(response(200, { dishes: [] }));
    if (url === '/api/admin/tables' && options.method === 'POST') return save.promise;
    if (url === '/api/admin/tables') return Promise.resolve(response(200, { tables: [] }));
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('[data-route="tables"]').click();
  await tick();
  document.querySelector('#new-table-button').click();
  document.querySelector('#table-number').value = '7';
  document.querySelector('#table-form').dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  document.querySelector('#table-form .close-dialog').click();
  document.querySelector('#new-table-button').click();
  document.querySelector('#table-number').value = '12';
  save.resolve(response(200, { table: { id: 't1', number: '7' } }));
  await tick();
  assert.equal(document.querySelector('#editor-dialog').open, true);
  assert.equal(document.querySelector('#table-number').value, '12');
});

test('an admin API 401 closes protected UI and focuses a quiet login state', async () => {
  const { document } = await harness((url) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return Promise.resolve(response(401, { error: 'Expired' }));
    if (url === '/api/admin/dishes') return Promise.resolve(response(200, { dishes: [] }));
    throw new Error(`Unexpected fetch ${url}`);
  });
  assert.equal(document.querySelector('#admin-view').hidden, true);
  assert.equal(document.querySelector('#login-view').hidden, false);
  assert.equal(document.activeElement, document.querySelector('#login'));
  assert.equal(document.querySelector('#toast-region').children.length, 0);
});

test('late menu responses cannot render after navigating to tables', async () => {
  const categories = deferred();
  const dishes = deferred();
  const { document } = await harness((url) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return categories.promise;
    if (url === '/api/admin/dishes') return dishes.promise;
    if (url === '/api/admin/tables') return Promise.resolve(response(200, { tables: [{ id: 't1', number: '7' }] }));
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('[data-route="tables"]').click();
  await tick();
  assert.match(document.querySelector('#tables-content').textContent, /7/);
  categories.resolve(response(200, { categories: [{ id: 'c1', name: 'Stale', sortOrder: 0 }] }));
  dishes.resolve(response(200, { dishes: [] }));
  await tick();
  assert.equal(document.querySelector('#category-count').textContent, '—');
  assert.doesNotMatch(document.querySelector('#menu-content').textContent, /Stale/);
});

test('availability toggle rolls back its rendered state when the request fails', async () => {
  const patch = deferred();
  const { window, document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return Promise.resolve(response(200, { categories: [{ id: 'c1', name: 'Food', sortOrder: 0 }] }));
    if (url === '/api/admin/dishes' && !options.method) return Promise.resolve(response(200, { dishes: [{ id: 'd1', categoryId: 'c1', name: 'Roll', price: 8, sortOrder: 0, isAvailable: true }] }));
    if (url === '/api/admin/dishes/d1') return patch.promise;
    throw new Error(`Unexpected fetch ${url}`);
  });
  const toggle = document.querySelector('.switch-row input');
  toggle.checked = false;
  toggle.dispatchEvent(new window.Event('change', { bubbles: true }));
  patch.resolve(response(500, { error: 'No save' }));
  await tick();
  assert.equal(document.querySelector('.switch-row input').checked, true);
  assert.match(document.querySelector('.switch-row').textContent, /Доступно/);
});

test('older availability success cannot overwrite a newer same-dish success', async () => {
  const firstPatch = deferred();
  const secondPatch = deferred();
  let patches = 0;
  const dish = { id: 'd1', categoryId: 'c1', name: 'Roll', price: 8, sortOrder: 0, isAvailable: true };
  const { window, document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return Promise.resolve(response(200, { categories: [{ id: 'c1', name: 'Food', sortOrder: 0 }] }));
    if (url === '/api/admin/dishes' && !options.method) return Promise.resolve(response(200, { dishes: [{ ...dish }] }));
    if (url === '/api/admin/dishes/d1' && options.method === 'PATCH') {
      patches += 1;
      return patches === 1 ? firstPatch.promise : secondPatch.promise;
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  const toggle = document.querySelector('.switch-row input');
  toggle.checked = false;
  toggle.dispatchEvent(new window.Event('change', { bubbles: true }));
  toggle.checked = true;
  toggle.dispatchEvent(new window.Event('change', { bubbles: true }));
  secondPatch.resolve(response(200, { dish: { ...dish, isAvailable: true } }));
  await tick();
  firstPatch.resolve(response(200, { dish: { ...dish, isAvailable: false } }));
  await tick();
  assert.equal(document.querySelector('.switch-row input').checked, true);
  assert.match(document.querySelector('.switch-row').textContent, /Доступно/);
});

test('older availability failure cannot roll back a newer same-dish success', async () => {
  const firstPatch = deferred();
  const secondPatch = deferred();
  let patches = 0;
  const dish = { id: 'd1', categoryId: 'c1', name: 'Roll', price: 8, sortOrder: 0, isAvailable: true };
  const { window, document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return Promise.resolve(response(200, { categories: [{ id: 'c1', name: 'Food', sortOrder: 0 }] }));
    if (url === '/api/admin/dishes' && !options.method) return Promise.resolve(response(200, { dishes: [{ ...dish }] }));
    if (url === '/api/admin/dishes/d1' && options.method === 'PATCH') {
      patches += 1;
      return patches === 1 ? firstPatch.promise : secondPatch.promise;
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  const toggle = document.querySelector('.switch-row input');
  toggle.checked = false;
  toggle.dispatchEvent(new window.Event('change', { bubbles: true }));
  toggle.checked = false;
  toggle.dispatchEvent(new window.Event('change', { bubbles: true }));
  secondPatch.resolve(response(200, { dish: { ...dish, isAvailable: false } }));
  await tick();
  firstPatch.resolve(response(500, { error: 'Older failure' }));
  await tick();
  assert.equal(document.querySelector('.switch-row input').checked, false);
  assert.match(document.querySelector('.switch-row').textContent, /Скрыто/);
  assert.doesNotMatch(document.querySelector('#toast-region').textContent, /Older failure/);
});

test('availability success is not overwritten by an older pending menu reload', async () => {
  const patch = deferred();
  const reloadedCategories = deferred();
  const reloadedDishes = deferred();
  let menuLoads = 0;
  const dish = { id: 'd1', categoryId: 'c1', name: 'Roll', price: 8, sortOrder: 0, isAvailable: true };
  const { window, document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories' && !options.method) {
      menuLoads += 1;
      return menuLoads === 1
        ? Promise.resolve(response(200, { categories: [{ id: 'c1', name: 'Food', sortOrder: 0 }] }))
        : reloadedCategories.promise;
    }
    if (url === '/api/admin/dishes' && !options.method) {
      return menuLoads === 1
        ? Promise.resolve(response(200, { dishes: [{ ...dish }] }))
        : reloadedDishes.promise;
    }
    if (url === '/api/admin/tables') return Promise.resolve(response(200, { tables: [] }));
    if (url === '/api/admin/dishes/d1' && options.method === 'PATCH') return patch.promise;
    throw new Error(`Unexpected fetch ${url}`);
  });
  const toggle = document.querySelector('.switch-row input');
  toggle.checked = false;
  toggle.dispatchEvent(new window.Event('change', { bubbles: true }));
  document.querySelector('[data-route="tables"]').click();
  await tick();
  document.querySelector('[data-route="menu"]').click();
  await tick();
  patch.resolve(response(200, { dish: { ...dish, isAvailable: false } }));
  await tick();
  assert.equal(document.querySelector('.switch-row input').checked, false);
  reloadedCategories.resolve(response(200, { categories: [{ id: 'c1', name: 'Food', sortOrder: 0 }] }));
  reloadedDishes.resolve(response(200, { dishes: [{ ...dish }] }));
  await tick();
  assert.equal(document.querySelector('.switch-row input').checked, false);
  assert.match(document.querySelector('.switch-row').textContent, /Скрыто/);
});

test('category edit success is not overwritten by an older pending menu reload', async () => {
  const save = deferred();
  const reloadedCategories = deferred();
  const reloadedDishes = deferred();
  let menuLoads = 0;
  const category = { id: 'c1', name: 'Food', sortOrder: 0 };
  const { window, document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories' && !options.method) {
      menuLoads += 1;
      return menuLoads === 1
        ? Promise.resolve(response(200, { categories: [{ ...category }] }))
        : reloadedCategories.promise;
    }
    if (url === '/api/admin/dishes' && !options.method) {
      return menuLoads === 1
        ? Promise.resolve(response(200, { dishes: [] }))
        : reloadedDishes.promise;
    }
    if (url === '/api/admin/tables') return Promise.resolve(response(200, { tables: [] }));
    if (url === '/api/admin/categories/c1' && options.method === 'PATCH') return save.promise;
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('.category-head button:first-of-type').click();
  document.querySelector('#category-name').value = 'Dinner';
  document.querySelector('#category-form').dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  document.querySelector('[data-route="tables"]').click();
  await tick();
  document.querySelector('[data-route="menu"]').click();
  await tick();
  save.resolve(response(200, { category: { ...category, name: 'Dinner' } }));
  await tick();
  assert.match(document.querySelector('#menu-content').textContent, /Dinner/);
  reloadedCategories.resolve(response(200, { categories: [{ ...category }] }));
  reloadedDishes.resolve(response(200, { dishes: [] }));
  await tick();
  assert.match(document.querySelector('#menu-content').textContent, /Dinner/);
  assert.doesNotMatch(document.querySelector('#menu-content').textContent, /Food/);
});

test('dish edit success is not overwritten by an older pending menu reload', async () => {
  const save = deferred();
  const reloadedCategories = deferred();
  const reloadedDishes = deferred();
  let menuLoads = 0;
  const dish = { id: 'd1', categoryId: 'c1', name: 'Roll', price: 8, sortOrder: 0, isAvailable: true };
  const { window, document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories' && !options.method) {
      menuLoads += 1;
      return menuLoads === 1
        ? Promise.resolve(response(200, { categories: [{ id: 'c1', name: 'Food', sortOrder: 0 }] }))
        : reloadedCategories.promise;
    }
    if (url === '/api/admin/dishes' && !options.method) {
      return menuLoads === 1
        ? Promise.resolve(response(200, { dishes: [{ ...dish }] }))
        : reloadedDishes.promise;
    }
    if (url === '/api/admin/tables') return Promise.resolve(response(200, { tables: [] }));
    if (url === '/api/admin/dishes/d1' && options.method === 'PATCH') return save.promise;
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('.dish-row .row-actions button:first-child').click();
  document.querySelector('#dish-name').value = 'Dragon roll';
  document.querySelector('#dish-form').dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  document.querySelector('[data-route="tables"]').click();
  await tick();
  document.querySelector('[data-route="menu"]').click();
  await tick();
  save.resolve(response(200, { dish: { ...dish, name: 'Dragon roll' } }));
  await tick();
  assert.match(document.querySelector('#menu-content').textContent, /Dragon roll/);
  reloadedCategories.resolve(response(200, { categories: [{ id: 'c1', name: 'Food', sortOrder: 0 }] }));
  reloadedDishes.resolve(response(200, { dishes: [{ ...dish }] }));
  await tick();
  assert.match(document.querySelector('#menu-content').textContent, /Dragon roll/);
  assert.doesNotMatch(document.querySelector('#menu-content').textContent, />Roll</);
});

test('category creation is not overwritten by an older pending menu reload', async () => {
  const save = deferred();
  const reloadedCategories = deferred();
  const reloadedDishes = deferred();
  let menuLoads = 0;
  const { window, document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories' && options.method === 'POST') return save.promise;
    if (url === '/api/admin/categories' && !options.method) {
      menuLoads += 1;
      return menuLoads === 1
        ? Promise.resolve(response(200, { categories: [] }))
        : reloadedCategories.promise;
    }
    if (url === '/api/admin/dishes' && !options.method) {
      return menuLoads === 1
        ? Promise.resolve(response(200, { dishes: [] }))
        : reloadedDishes.promise;
    }
    if (url === '/api/admin/tables') return Promise.resolve(response(200, { tables: [] }));
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('#new-category-button').click();
  document.querySelector('#category-name').value = 'Dessert';
  document.querySelector('#category-form').dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  document.querySelector('[data-route="tables"]').click();
  await tick();
  document.querySelector('[data-route="menu"]').click();
  await tick();
  save.resolve(response(201, { category: { id: 'c2', name: 'Dessert', sortOrder: 0 } }));
  await tick();
  assert.match(document.querySelector('#menu-content').textContent, /Dessert/);
  reloadedCategories.resolve(response(200, { categories: [] }));
  reloadedDishes.resolve(response(200, { dishes: [] }));
  await tick();
  assert.match(document.querySelector('#menu-content').textContent, /Dessert/);
  assert.equal(document.querySelector('#category-count').textContent, '1');
});

test('dish creation is not overwritten by an older pending menu reload', async () => {
  const save = deferred();
  const reloadedCategories = deferred();
  const reloadedDishes = deferred();
  let menuLoads = 0;
  const category = { id: 'c1', name: 'Food', sortOrder: 0 };
  const { window, document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories' && !options.method) {
      menuLoads += 1;
      return menuLoads === 1
        ? Promise.resolve(response(200, { categories: [{ ...category }] }))
        : reloadedCategories.promise;
    }
    if (url === '/api/admin/dishes' && options.method === 'POST') return save.promise;
    if (url === '/api/admin/dishes' && !options.method) {
      return menuLoads === 1
        ? Promise.resolve(response(200, { dishes: [] }))
        : reloadedDishes.promise;
    }
    if (url === '/api/admin/tables') return Promise.resolve(response(200, { tables: [] }));
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('#new-dish-button').click();
  document.querySelector('#dish-name').value = 'Dragon roll';
  document.querySelector('#dish-price').value = '12';
  document.querySelector('#dish-category').value = 'c1';
  document.querySelector('#dish-form').dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  document.querySelector('[data-route="tables"]').click();
  await tick();
  document.querySelector('[data-route="menu"]').click();
  await tick();
  save.resolve(response(201, { dish: { id: 'd2', categoryId: 'c1', name: 'Dragon roll', price: 12, sortOrder: 0, isAvailable: true } }));
  await tick();
  assert.match(document.querySelector('#menu-content').textContent, /Dragon roll/);
  reloadedCategories.resolve(response(200, { categories: [{ ...category }] }));
  reloadedDishes.resolve(response(200, { dishes: [] }));
  await tick();
  assert.match(document.querySelector('#menu-content').textContent, /Dragon roll/);
  assert.equal(document.querySelector('#dish-count').textContent, '1');
});

test('a delayed category creation does not resurrect the category after a reloaded instance is deleted', async () => {
  const save = deferred();
  let menuLoads = 0;
  const category = { id: 'c2', name: 'Dessert', sortOrder: 0 };
  const { window, document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories' && options.method === 'POST') return save.promise;
    if (url === '/api/admin/categories' && !options.method) {
      menuLoads += 1;
      return Promise.resolve(response(200, { categories: menuLoads === 1 ? [] : [{ ...category }] }));
    }
    if (url === '/api/admin/dishes' && !options.method) return Promise.resolve(response(200, { dishes: [] }));
    if (url === '/api/admin/tables') return Promise.resolve(response(200, { tables: [] }));
    if (url === '/api/admin/categories/c2' && options.method === 'DELETE') {
      return Promise.resolve(response(200, { deleted: true }));
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('#new-category-button').click();
  document.querySelector('#category-name').value = 'Dessert';
  document.querySelector('#category-form').dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  document.querySelector('[data-route="tables"]').click();
  await tick();
  document.querySelector('[data-route="menu"]').click();
  await tick();
  document.querySelector('.category-head button:last-child').click();
  await tick();
  assert.equal(document.querySelector('#category-count').textContent, '0');
  save.resolve(response(201, { category }));
  await tick();
  assert.equal(document.querySelector('#category-count').textContent, '0');
  assert.doesNotMatch(document.querySelector('#menu-content').textContent, /Dessert/);
});

test('a delayed dish creation does not resurrect the dish after a reloaded instance is deleted', async () => {
  const save = deferred();
  let menuLoads = 0;
  const category = { id: 'c1', name: 'Food', sortOrder: 0 };
  const dish = { id: 'd2', categoryId: 'c1', name: 'Dragon roll', price: 12, sortOrder: 0, isAvailable: true };
  const { window, document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories' && !options.method) {
      menuLoads += 1;
      return Promise.resolve(response(200, { categories: [{ ...category }] }));
    }
    if (url === '/api/admin/dishes' && options.method === 'POST') return save.promise;
    if (url === '/api/admin/dishes' && !options.method) {
      return Promise.resolve(response(200, { dishes: menuLoads === 1 ? [] : [{ ...dish }] }));
    }
    if (url === '/api/admin/tables') return Promise.resolve(response(200, { tables: [] }));
    if (url === '/api/admin/dishes/d2' && options.method === 'DELETE') {
      return Promise.resolve(response(200, { deleted: true }));
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('#new-dish-button').click();
  document.querySelector('#dish-name').value = 'Dragon roll';
  document.querySelector('#dish-price').value = '12';
  document.querySelector('#dish-category').value = 'c1';
  document.querySelector('#dish-form').dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  document.querySelector('[data-route="tables"]').click();
  await tick();
  document.querySelector('[data-route="menu"]').click();
  await tick();
  document.querySelector('.dish-row .row-actions button:last-child').click();
  await tick();
  assert.equal(document.querySelector('#dish-count').textContent, '0');
  save.resolve(response(201, { dish }));
  await tick();
  assert.equal(document.querySelector('#dish-count').textContent, '0');
  assert.doesNotMatch(document.querySelector('#menu-content').textContent, /Dragon roll/);
});

test('a delayed category delete removes the reloaded instance with the same ID', async () => {
  const deletion = deferred();
  let menuLoads = 0;
  const category = { id: 'c1', name: 'Food', sortOrder: 0 };
  const { document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories' && !options.method) {
      menuLoads += 1;
      return Promise.resolve(response(200, { categories: [{ ...category }] }));
    }
    if (url === '/api/admin/dishes' && !options.method) return Promise.resolve(response(200, { dishes: [] }));
    if (url === '/api/admin/tables') return Promise.resolve(response(200, { tables: [] }));
    if (url === '/api/admin/categories/c1' && options.method === 'DELETE') return deletion.promise;
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('.category-head button:last-child').click();
  document.querySelector('[data-route="tables"]').click();
  await tick();
  document.querySelector('[data-route="menu"]').click();
  await tick();
  assert.equal(menuLoads, 2);
  assert.match(document.querySelector('#menu-content').textContent, /Food/);
  deletion.resolve(response(200, { deleted: true }));
  await tick();
  assert.equal(document.querySelector('#category-count').textContent, '0');
  assert.doesNotMatch(document.querySelector('#menu-content').textContent, /Food/);
});

test('a category deleted before a pending menu reload resolves is not restored', async () => {
  const deletion = deferred();
  const reloadedCategories = deferred();
  const reloadedDishes = deferred();
  let menuLoads = 0;
  const category = { id: 'c1', name: 'Food', sortOrder: 0 };
  const { document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories' && !options.method) {
      menuLoads += 1;
      return menuLoads === 1
        ? Promise.resolve(response(200, { categories: [{ ...category }] }))
        : reloadedCategories.promise;
    }
    if (url === '/api/admin/dishes' && !options.method) {
      return menuLoads === 1
        ? Promise.resolve(response(200, { dishes: [] }))
        : reloadedDishes.promise;
    }
    if (url === '/api/admin/tables') return Promise.resolve(response(200, { tables: [] }));
    if (url === '/api/admin/categories/c1' && options.method === 'DELETE') return deletion.promise;
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('.category-head button:last-child').click();
  document.querySelector('[data-route="tables"]').click();
  await tick();
  document.querySelector('[data-route="menu"]').click();
  await tick();
  assert.equal(menuLoads, 2);
  deletion.resolve(response(200, { deleted: true }));
  await tick();
  assert.equal(document.querySelector('#category-count').textContent, '0');
  reloadedCategories.resolve(response(200, { categories: [{ ...category }] }));
  reloadedDishes.resolve(response(200, { dishes: [] }));
  await tick();
  assert.equal(document.querySelector('#category-count').textContent, '0');
  assert.doesNotMatch(document.querySelector('#menu-content').textContent, /Food/);
});

test('an older category delete success removes a newer same-category edit', async () => {
  const deletion = deferred();
  let menuLoads = 0;
  const category = { id: 'c1', name: 'Food', sortOrder: 0 };
  const { window, document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories' && !options.method) {
      menuLoads += 1;
      return Promise.resolve(response(200, { categories: [{ ...category }] }));
    }
    if (url === '/api/admin/dishes' && !options.method) return Promise.resolve(response(200, { dishes: [] }));
    if (url === '/api/admin/tables') return Promise.resolve(response(200, { tables: [] }));
    if (url === '/api/admin/categories/c1' && options.method === 'DELETE') return deletion.promise;
    if (url === '/api/admin/categories/c1' && options.method === 'PATCH') {
      return Promise.resolve(response(200, { category: { ...category, name: 'Dinner' } }));
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('.category-head button:last-child').click();
  document.querySelector('[data-route="tables"]').click();
  await tick();
  document.querySelector('[data-route="menu"]').click();
  await tick();
  document.querySelector('.category-head button:first-of-type').click();
  document.querySelector('#category-name').value = 'Dinner';
  document.querySelector('#category-form').dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  await tick();
  deletion.resolve(response(200, { deleted: true }));
  await tick();
  assert.doesNotMatch(document.querySelector('#menu-content').textContent, /Dinner/);
  assert.equal(document.querySelector('#category-count').textContent, '0');
});

test('an older dish delete success removes a newer same-dish availability update', async () => {
  const deletion = deferred();
  const availability = deferred();
  const dish = { id: 'd1', categoryId: 'c1', name: 'Roll', price: 8, sortOrder: 0, isAvailable: true };
  const { window, document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return Promise.resolve(response(200, { categories: [{ id: 'c1', name: 'Food', sortOrder: 0 }] }));
    if (url === '/api/admin/dishes' && !options.method) return Promise.resolve(response(200, { dishes: [{ ...dish }] }));
    if (url === '/api/admin/dishes/d1' && options.method === 'DELETE') return deletion.promise;
    if (url === '/api/admin/dishes/d1' && options.method === 'PATCH') return availability.promise;
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('.dish-row .row-actions button:last-child').click();
  const toggle = document.querySelector('.switch-row input');
  toggle.checked = false;
  toggle.dispatchEvent(new window.Event('change', { bubbles: true }));
  availability.resolve(response(200, { dish: { ...dish, isAvailable: false } }));
  await tick();
  deletion.resolve(response(200, { deleted: true }));
  await tick();
  assert.equal(document.querySelector('#dish-count').textContent, '0');
  assert.doesNotMatch(document.querySelector('#menu-content').textContent, /Roll/);
});

test('a delayed availability completion updates the reloaded dish instance with the same ID', async () => {
  const patch = deferred();
  let dishLoads = 0;
  const dish = { id: 'd1', categoryId: 'c1', name: 'Roll', price: 8, sortOrder: 0, isAvailable: true };
  const { window, document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return Promise.resolve(response(200, { categories: [{ id: 'c1', name: 'Food', sortOrder: 0 }] }));
    if (url === '/api/admin/dishes' && !options.method) {
      dishLoads += 1;
      return Promise.resolve(response(200, { dishes: [{ ...dish }] }));
    }
    if (url === '/api/admin/tables') return Promise.resolve(response(200, { tables: [] }));
    if (url === '/api/admin/dishes/d1' && options.method === 'PATCH') return patch.promise;
    throw new Error(`Unexpected fetch ${url}`);
  });
  const toggle = document.querySelector('.switch-row input');
  toggle.checked = false;
  toggle.dispatchEvent(new window.Event('change', { bubbles: true }));
  document.querySelector('[data-route="tables"]').click();
  await tick();
  document.querySelector('[data-route="menu"]').click();
  await tick();
  assert.equal(dishLoads, 2);
  assert.equal(document.querySelector('.switch-row input').checked, true);
  patch.resolve(response(200, { dish: { ...dish, isAvailable: false } }));
  await tick();
  assert.equal(document.querySelector('.switch-row input').checked, false);
  assert.match(document.querySelector('.switch-row').textContent, /Скрыто/);
});

test('a delayed dish edit updates the reloaded instance with the same ID', async () => {
  const save = deferred();
  let dishLoads = 0;
  const dish = { id: 'd1', categoryId: 'c1', name: 'Roll', price: 8, sortOrder: 0, isAvailable: true };
  const { window, document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return Promise.resolve(response(200, { categories: [{ id: 'c1', name: 'Food', sortOrder: 0 }] }));
    if (url === '/api/admin/dishes' && !options.method) {
      dishLoads += 1;
      return Promise.resolve(response(200, { dishes: [{ ...dish }] }));
    }
    if (url === '/api/admin/tables') return Promise.resolve(response(200, { tables: [] }));
    if (url === '/api/admin/dishes/d1' && options.method === 'PATCH') return save.promise;
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('.dish-row .row-actions button:first-child').click();
  document.querySelector('#dish-name').value = 'Reloaded roll';
  document.querySelector('#dish-form').dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  document.querySelector('[data-route="tables"]').click();
  await tick();
  document.querySelector('[data-route="menu"]').click();
  await tick();
  assert.equal(dishLoads, 2);
  assert.match(document.querySelector('#menu-content').textContent, /Roll/);
  save.resolve(response(200, { dish: { ...dish, name: 'Reloaded roll' } }));
  await tick();
  assert.match(document.querySelector('#menu-content').textContent, /Reloaded roll/);
});

test('a delayed dish edit does not resurrect an item absent from the reloaded collection', async () => {
  const save = deferred();
  let dishLoads = 0;
  const dish = { id: 'd1', categoryId: 'c1', name: 'Roll', price: 8, sortOrder: 0, isAvailable: true };
  const { window, document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return Promise.resolve(response(200, { categories: [{ id: 'c1', name: 'Food', sortOrder: 0 }] }));
    if (url === '/api/admin/dishes' && !options.method) {
      dishLoads += 1;
      return Promise.resolve(response(200, { dishes: dishLoads === 1 ? [{ ...dish }] : [] }));
    }
    if (url === '/api/admin/tables') return Promise.resolve(response(200, { tables: [] }));
    if (url === '/api/admin/dishes/d1' && options.method === 'PATCH') return save.promise;
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('.dish-row .row-actions button:first-child').click();
  document.querySelector('#dish-name').value = 'Stale edit';
  document.querySelector('#dish-form').dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  document.querySelector('[data-route="tables"]').click();
  await tick();
  document.querySelector('[data-route="menu"]').click();
  await tick();
  assert.equal(document.querySelector('#dish-count').textContent, '0');
  save.resolve(response(200, { dish: { ...dish, name: 'Stale edit' } }));
  await tick();
  assert.equal(document.querySelector('#dish-count').textContent, '0');
  assert.doesNotMatch(document.querySelector('#menu-content').textContent, /Stale edit/);
});

test('availability 401 uses the centralized session transition without an error toast', async () => {
  const { window, document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return Promise.resolve(response(200, { categories: [{ id: 'c1', name: 'Food', sortOrder: 0 }] }));
    if (url === '/api/admin/dishes' && !options.method) return Promise.resolve(response(200, { dishes: [{ id: 'd1', categoryId: 'c1', name: 'Roll', price: 8, sortOrder: 0, isAvailable: true }] }));
    if (url === '/api/admin/dishes/d1') return Promise.resolve(response(401, { error: 'Expired' }));
    throw new Error(`Unexpected fetch ${url}`);
  });
  const toggle = document.querySelector('.switch-row input');
  toggle.checked = false;
  toggle.dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();
  assert.equal(document.querySelector('#login-view').hidden, false);
  assert.equal(document.querySelector('#toast-region').children.length, 0);
});

test('admin dish prices use Kazakhstani tenge rather than dollars', async () => {
  const { document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return Promise.resolve(response(200, { categories: [{ id: 'c1', name: 'Food', sortOrder: 0 }] }));
    if (url === '/api/admin/dishes' && !options.method) return Promise.resolve(response(200, { dishes: [{ id: 'd1', categoryId: 'c1', name: 'Roll', price: 2500, sortOrder: 0, isAvailable: true }] }));
    throw new Error(`Unexpected fetch ${url}`);
  });
  const price = document.querySelector('.dish-row .money').textContent;
  assert.match(price, /₸/);
  assert.doesNotMatch(price, /\$/);
});

test('an older table delete success removes the table despite a newer same-table failure', async () => {
  const firstDelete = deferred();
  const secondDelete = deferred();
  let deletes = 0;
  const table = { id: 't1', number: '7' };
  const { document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return Promise.resolve(response(200, { categories: [] }));
    if (url === '/api/admin/dishes') return Promise.resolve(response(200, { dishes: [] }));
    if (url === '/api/admin/tables' && !options.method) return Promise.resolve(response(200, { tables: [{ ...table }] }));
    if (url === '/api/admin/tables/t1' && options.method === 'DELETE') {
      deletes += 1;
      return deletes === 1 ? firstDelete.promise : secondDelete.promise;
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('[data-route="tables"]').click();
  await tick();
  document.querySelector('#tables-content .row-actions button:last-child').click();
  document.querySelector('[data-route="menu"]').click();
  await tick();
  document.querySelector('[data-route="tables"]').click();
  await tick();
  document.querySelector('#tables-content .row-actions button:last-child').click();
  secondDelete.resolve(response(500, { error: 'Keep table' }));
  await tick();
  firstDelete.resolve(response(200, { deleted: true }));
  await tick();
  assert.doesNotMatch(document.querySelector('#tables-content').textContent, /7/);
  assert.equal(document.querySelector('#table-count').textContent, '0 столов');
});

test('a table deleted before a pending table reload resolves is not restored', async () => {
  const deletion = deferred();
  const reloadedTables = deferred();
  let tableLoads = 0;
  const table = { id: 't1', number: '7' };
  const { document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return Promise.resolve(response(200, { categories: [] }));
    if (url === '/api/admin/dishes') return Promise.resolve(response(200, { dishes: [] }));
    if (url === '/api/admin/tables' && !options.method) {
      tableLoads += 1;
      return tableLoads === 1
        ? Promise.resolve(response(200, { tables: [{ ...table }] }))
        : reloadedTables.promise;
    }
    if (url === '/api/admin/tables/t1' && options.method === 'DELETE') return deletion.promise;
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('[data-route="tables"]').click();
  await tick();
  document.querySelector('#tables-content .row-actions button:last-child').click();
  document.querySelector('[data-route="menu"]').click();
  await tick();
  document.querySelector('[data-route="tables"]').click();
  await tick();
  assert.equal(tableLoads, 2);
  deletion.resolve(response(200, { deleted: true }));
  await tick();
  assert.equal(document.querySelector('#table-count').textContent, '0 столов');
  reloadedTables.resolve(response(200, { tables: [{ ...table }] }));
  await tick();
  assert.equal(document.querySelector('#table-count').textContent, '0 столов');
  assert.doesNotMatch(document.querySelector('#tables-content').textContent, /7/);
});

test('table creation is not overwritten by an older pending table reload', async () => {
  const save = deferred();
  const reloadedTables = deferred();
  let tableLoads = 0;
  const { window, document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return Promise.resolve(response(200, { categories: [] }));
    if (url === '/api/admin/dishes') return Promise.resolve(response(200, { dishes: [] }));
    if (url === '/api/admin/tables' && options.method === 'POST') return save.promise;
    if (url === '/api/admin/tables' && !options.method) {
      tableLoads += 1;
      return tableLoads === 1
        ? Promise.resolve(response(200, { tables: [] }))
        : reloadedTables.promise;
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('[data-route="tables"]').click();
  await tick();
  document.querySelector('#new-table-button').click();
  document.querySelector('#table-number').value = '7';
  document.querySelector('#table-form').dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  document.querySelector('[data-route="menu"]').click();
  await tick();
  document.querySelector('[data-route="tables"]').click();
  await tick();
  save.resolve(response(201, { table: { id: 't1', number: '7' } }));
  await tick();
  assert.match(document.querySelector('#tables-content').textContent, /7/);
  reloadedTables.resolve(response(200, { tables: [] }));
  await tick();
  assert.match(document.querySelector('#tables-content').textContent, /7/);
  assert.equal(document.querySelector('#table-count').textContent, '1 стол');
});

test('a delayed table creation does not resurrect the table after a reloaded instance is deleted', async () => {
  const save = deferred();
  let tableLoads = 0;
  const table = { id: 't1', number: '7' };
  const { window, document } = await harness((url, options = {}) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return Promise.resolve(response(200, { categories: [] }));
    if (url === '/api/admin/dishes') return Promise.resolve(response(200, { dishes: [] }));
    if (url === '/api/admin/tables' && options.method === 'POST') return save.promise;
    if (url === '/api/admin/tables' && !options.method) {
      tableLoads += 1;
      return Promise.resolve(response(200, { tables: tableLoads === 1 ? [] : [{ ...table }] }));
    }
    if (url === '/api/admin/tables/t1' && options.method === 'DELETE') {
      return Promise.resolve(response(200, { deleted: true }));
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('[data-route="tables"]').click();
  await tick();
  document.querySelector('#new-table-button').click();
  document.querySelector('#table-number').value = '7';
  document.querySelector('#table-form').dispatchEvent(new window.SubmitEvent('submit', { bubbles: true, cancelable: true }));
  document.querySelector('[data-route="menu"]').click();
  await tick();
  document.querySelector('[data-route="tables"]').click();
  await tick();
  document.querySelector('#tables-content .row-actions button:last-child').click();
  await tick();
  assert.equal(document.querySelector('#table-count').textContent, '0 столов');
  save.resolve(response(201, { table }));
  await tick();
  assert.equal(document.querySelector('#table-count').textContent, '0 столов');
  assert.doesNotMatch(document.querySelector('#tables-content').textContent, /7/);
});

test('QR download handles session expiry and always revokes successful blob URLs', async () => {
  let qrStatus = 200;
  const revoked = [];
  const { document, window } = await harness((url) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return Promise.resolve(response(200, { categories: [] }));
    if (url === '/api/admin/dishes') return Promise.resolve(response(200, { dishes: [] }));
    if (url === '/api/admin/tables') return Promise.resolve(response(200, { tables: [{ id: 't1', number: '7' }] }));
    if (url === '/api/admin/tables/t1/qr') return Promise.resolve(response(qrStatus, qrStatus === 401 ? { error: 'Expired' } : {}, { blob: new window.Blob(['qr']), headers: { 'Content-Disposition': 'attachment; filename="seven.png"' } }));
    throw new Error(`Unexpected fetch ${url}`);
  });
  window.URL.createObjectURL = () => 'blob:qr';
  window.URL.revokeObjectURL = (url) => revoked.push(url);
  document.querySelector('[data-route="tables"]').click();
  await tick();
  document.querySelector('#tables-content button').click();
  await tick();
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.deepEqual(revoked, ['blob:qr']);
  qrStatus = 401;
  document.querySelector('#tables-content button').click();
  await tick();
  assert.equal(document.querySelector('#admin-view').hidden, true);
  assert.equal(document.querySelector('#login-view').hidden, false);
});

test('mobile navigation traps focus, closes on Escape, and restores the trigger', async () => {
  const { window, document } = await harness((url) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return Promise.resolve(response(200, { categories: [] }));
    if (url === '/api/admin/dishes') return Promise.resolve(response(200, { dishes: [] }));
    throw new Error(`Unexpected fetch ${url}`);
  });
  const trigger = document.querySelector('#mobile-nav');
  trigger.click();
  const firstLink = document.querySelector('#sidebar [data-route]');
  const logout = document.querySelector('#logout-button');
  assert.equal(document.activeElement, firstLink);
  assert.equal(document.querySelector('.content').getAttribute('aria-hidden'), 'true');
  logout.focus();
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, firstLink);
  firstLink.focus();
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, logout);
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(document.querySelector('#sidebar').classList.contains('open'), false);
  assert.equal(document.querySelector('.content').hasAttribute('aria-hidden'), false);
  assert.equal(document.activeElement, trigger);
});

test('mobile navigation restores focus after route clicks and popstate', async () => {
  const { window, document } = await harness((url) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return Promise.resolve(response(200, { categories: [] }));
    if (url === '/api/admin/dishes') return Promise.resolve(response(200, { dishes: [] }));
    if (url === '/api/admin/tables') return Promise.resolve(response(200, { tables: [] }));
    throw new Error(`Unexpected fetch ${url}`);
  });
  const trigger = document.querySelector('#mobile-nav');
  trigger.click();
  document.querySelector('[data-route="tables"]').click();
  assert.equal(document.activeElement, trigger);
  trigger.click();
  window.history.pushState({}, '', '/admin/menu');
  window.dispatchEvent(new window.PopStateEvent('popstate'));
  assert.equal(document.activeElement, trigger);
});

test('logout rejects safely, prevents duplicates, and restores its control', async () => {
  const logout = deferred();
  let calls = 0;
  const { document } = await harness((url) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return Promise.resolve(response(200, { categories: [] }));
    if (url === '/api/admin/dishes') return Promise.resolve(response(200, { dishes: [] }));
    if (url === '/api/admin/logout') { calls += 1; return logout.promise; }
    throw new Error(`Unexpected fetch ${url}`);
  });
  const button = document.querySelector('#logout-button');
  button.click();
  button.click();
  assert.equal(calls, 1);
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, 'Выходим…');
  logout.reject(new Error('Offline'));
  await tick();
  assert.equal(document.querySelector('#admin-view').hidden, false);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, 'Выйти');
  assert.match(document.querySelector('#toast-region').textContent, /Не удалось выполнить действие/);
});

test('logout 401 returns to login without duplicate error noise', async () => {
  const { document } = await harness((url) => {
    if (url === '/api/admin/session') return Promise.resolve(response(200, {}));
    if (url === '/api/admin/categories') return Promise.resolve(response(200, { categories: [] }));
    if (url === '/api/admin/dishes') return Promise.resolve(response(200, { dishes: [] }));
    if (url === '/api/admin/logout') return Promise.resolve(response(401, { error: 'Expired' }));
    throw new Error(`Unexpected fetch ${url}`);
  });
  document.querySelector('#logout-button').click();
  await tick();
  assert.equal(document.querySelector('#admin-view').hidden, true);
  assert.equal(document.querySelector('#login-view').hidden, false);
  assert.equal(document.querySelector('#toast-region').children.length, 0);
});

test('small-screen dish actions stack without clipping', () => {
  assert.match(css(), /@media\(max-width:375px\)/);
  assert.match(css(), /\.category-head\{flex-wrap:wrap/);
  assert.match(css(), /\.category-head h4\{min-width:0;overflow-wrap:anywhere/);
  assert.match(css(), /\.dish-row\{grid-template-columns:48px minmax\(0,1fr\)/);
  assert.match(css(), /\.dish-row \.row-actions\{grid-column:1\/-1/);
  assert.match(css(), /\.dish-row \.row-actions button\{flex:1/);
});
