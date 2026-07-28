const test = require('node:test');
const assert = require('node:assert/strict');

const categoryId = '11111111-1111-4111-8111-111111111111';
const dishId = '22222222-2222-4222-8222-222222222222';

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

const authorized = async () => true;

test('admin route modules export Vercel handlers and injectable factories', () => {
  const routes = [
    ['api/admin/categories/index.js', 'createCategoriesHandler'],
    ['api/admin/categories/[id].js', 'createCategoryHandler'],
    ['api/admin/dishes/index.js', 'createDishesHandler'],
    ['api/admin/dishes/[id].js', 'createDishHandler'],
  ];
  for (const [route, factory] of routes) {
    const exported = load(route);
    assert.equal(typeof exported, 'function');
    assert.equal(typeof exported[factory], 'function');
  }
});

test('admin authorization defaults to fail closed and is injectable', async () => {
  const { createCategoriesHandler } = load('api/admin/categories/index.js');
  let queryCalls = 0;
  const query = async () => {
    queryCalls += 1;
    return [];
  };
  const denied = await invoke(createCategoriesHandler({ query }), { method: 'GET' });
  assert.equal(denied.statusCode, 401);
  assert.deepEqual(denied.body, { error: 'Unauthorized' });
  assert.equal(queryCalls, 0);

  const throwing = await invoke(createCategoriesHandler({
    query,
    authorize: async () => { throw new Error('secret'); },
  }), { method: 'GET' });
  assert.equal(throwing.statusCode, 401);
  assert.equal(queryCalls, 0);

  const allowed = await invoke(createCategoriesHandler({ query, authorize: authorized }), {
    method: 'GET',
  });
  assert.equal(allowed.statusCode, 200);
  assert.equal(queryCalls, 1);
});

test('category collection lists in stable order and creates parameterized rows', async () => {
  const { createCategoriesHandler } = load('api/admin/categories/index.js');
  const calls = [];
  const rows = [
    { id: categoryId, name: 'Rolls', sort_order: 2, created_at: '2026-01-01T00:00:00Z' },
  ];
  const handler = createCategoriesHandler({
    authorize: authorized,
    query: async (sql, values) => {
      calls.push({ sql, values });
      return rows;
    },
  });

  const listed = await invoke(handler, { method: 'GET' });
  assert.equal(listed.statusCode, 200);
  assert.deepEqual(listed.body, {
    categories: [{
      id: categoryId,
      name: 'Rolls',
      sortOrder: 2,
      createdAt: '2026-01-01T00:00:00Z',
    }],
  });
  assert.match(calls[0].sql, /ORDER BY sort_order, id/i);
  assert.deepEqual(calls[0].values, []);

  const created = await invoke(handler, {
    method: 'POST',
    body: { name: ' Drinks ', sort_order: 3 },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.category.name, 'Rolls');
  assert.match(calls[1].sql, /INSERT INTO categories \(name, sort_order\) VALUES \(\$1, \$2\)/i);
  assert.deepEqual(calls[1].values, ['Drinks', 3]);
});

test('category collection rejects invalid bodies and unsupported methods', async () => {
  const { createCategoriesHandler } = load('api/admin/categories/index.js');
  let calls = 0;
  const handler = createCategoriesHandler({
    authorize: authorized,
    query: async () => { calls += 1; return []; },
  });
  const invalidBodies = [
    null,
    {},
    { name: '' },
    { name: 'ok', sort_order: -1 },
    { name: 'ok', sort_order: 1.5 },
    { name: 'ok', unknown: true },
  ];
  for (const body of invalidBodies) {
    const response = await invoke(handler, { method: 'POST', body });
    assert.equal(response.statusCode, 400);
  }
  assert.equal(calls, 0);
  const method = await invoke(handler, { method: 'DELETE' });
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.allow, 'GET, POST');
});

test('category item patches partial fields and deletes by UUID', async () => {
  const { createCategoryHandler } = load('api/admin/categories/[id].js');
  const calls = [];
  const handler = createCategoryHandler({
    authorize: authorized,
    query: async (sql, values) => {
      calls.push({ sql, values });
      return [{ id: categoryId, name: 'Hot', sort_order: 7, created_at: 'now' }];
    },
  });
  const patched = await invoke(handler, {
    method: 'PATCH',
    query: { id: categoryId },
    body: { sort_order: 7 },
  });
  assert.equal(patched.statusCode, 200);
  assert.deepEqual(calls[0].values, [7, categoryId]);
  assert.match(calls[0].sql, /SET sort_order = \$1[\s\S]*WHERE id = \$2/i);

  const deleted = await invoke(handler, {
    method: 'DELETE',
    query: { id: categoryId },
  });
  assert.equal(deleted.statusCode, 200);
  assert.deepEqual(deleted.body, { deleted: true });
  assert.deepEqual(calls[1].values, [categoryId]);
  assert.match(calls[1].sql, /DELETE FROM categories WHERE id = \$1/i);
});

test('category item validates PATCH, handles missing rows and FK restriction', async () => {
  const { createCategoryHandler } = load('api/admin/categories/[id].js');
  let calls = 0;
  const noRows = createCategoryHandler({
    authorize: authorized,
    query: async () => { calls += 1; return []; },
  });
  for (const body of [{}, { unknown: 1 }, { name: '' }]) {
    const invalid = await invoke(noRows, {
      method: 'PATCH', query: { id: categoryId }, body,
    });
    assert.equal(invalid.statusCode, 400);
  }
  const badId = await invoke(noRows, {
    method: 'DELETE', query: { id: 'bad' },
  });
  assert.equal(badId.statusCode, 400);
  assert.equal(calls, 0);

  const missing = await invoke(noRows, {
    method: 'DELETE', query: { id: categoryId },
  });
  assert.equal(missing.statusCode, 404);

  const restricted = await invoke(createCategoryHandler({
    authorize: authorized,
    query: async () => { const error = new Error('sensitive'); error.code = '23503'; throw error; },
  }), { method: 'DELETE', query: { id: categoryId } });
  assert.equal(restricted.statusCode, 409);
  assert.deepEqual(restricted.body, { error: 'Category is in use' });
});

test('dish collection includes unavailable dishes and creates all supported fields', async () => {
  const { createDishesHandler } = load('api/admin/dishes/index.js');
  const calls = [];
  const row = {
    id: dishId,
    category_id: categoryId,
    name: 'Tea',
    description: null,
    price: '2.5',
    cost_price: '1',
    photo_url: null,
    is_available: false,
    sort_order: 4,
    created_at: 'created',
    updated_at: 'updated',
  };
  const handler = createDishesHandler({
    authorize: authorized,
    query: async (sql, values) => {
      calls.push({ sql, values });
      return [row];
    },
  });
  const listed = await invoke(handler, { method: 'GET' });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.body.dishes[0].isAvailable, false);
  assert.equal(listed.body.dishes[0].price, '2.50');
  assert.equal(listed.body.dishes[0].costPrice, '1.00');
  assert.doesNotMatch(calls[0].sql, /is_available\s*=\s*true/i);
  assert.match(calls[0].sql, /ORDER BY sort_order, id/i);

  const body = {
    category_id: categoryId,
    name: ' Tea ',
    description: null,
    price: 2.5,
    cost_price: 1,
    photo_url: '/tea.jpg',
    is_available: false,
    sort_order: 4,
  };
  const created = await invoke(handler, { method: 'POST', body });
  assert.equal(created.statusCode, 201);
  assert.deepEqual(calls[1].values, [
    categoryId, 'Tea', null, 2.5, 1, '/tea.jpg', false, 4,
  ]);
  assert.match(calls[1].sql, /INSERT INTO dishes/i);
});

test('dish collection validates required, money, boolean, sort and unknown fields', async () => {
  const { createDishesHandler } = load('api/admin/dishes/index.js');
  let calls = 0;
  const handler = createDishesHandler({
    authorize: authorized,
    query: async () => { calls += 1; return []; },
  });
  const base = { category_id: categoryId, name: 'Tea', price: 2.5 };
  const invalidBodies = [
    null,
    {},
    { ...base, category_id: 'bad' },
    { ...base, name: '' },
    { ...base, price: -1 },
    { ...base, price: 1.001 },
    { ...base, cost_price: -1 },
    { ...base, is_available: 1 },
    { ...base, sort_order: -1 },
    { ...base, extra: true },
  ];
  for (const body of invalidBodies) {
    const response = await invoke(handler, { method: 'POST', body });
    assert.equal(response.statusCode, 400);
  }
  assert.equal(calls, 0);
  const method = await invoke(handler, { method: 'PATCH' });
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.allow, 'GET, POST');
});

test('dish item supports one-request availability toggle and updates updated_at', async () => {
  const { createDishHandler } = load('api/admin/dishes/[id].js');
  const calls = [];
  const handler = createDishHandler({
    authorize: authorized,
    query: async (sql, values) => {
      calls.push({ sql, values });
      return [{
        id: dishId, category_id: categoryId, name: 'Tea', description: null,
        price: 2.5, cost_price: null, photo_url: null, is_available: false,
        sort_order: 0, created_at: 'created', updated_at: 'updated',
      }];
    },
  });
  const response = await invoke(handler, {
    method: 'PATCH',
    query: { id: dishId },
    body: { is_available: false },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.dish.isAvailable, false);
  assert.deepEqual(calls[0].values, [false, dishId]);
  assert.match(calls[0].sql, /SET is_available = \$1, updated_at = now\(\)/i);
  assert.match(calls[0].sql, /WHERE id = \$2/i);
});

test('dish item validates PATCH, returns 404, deletes, and hides database errors', async () => {
  const { createDishHandler } = load('api/admin/dishes/[id].js');
  let calls = 0;
  const missingHandler = createDishHandler({
    authorize: authorized,
    query: async () => { calls += 1; return []; },
  });
  for (const body of [{}, { unknown: true }, { price: '2.50' }]) {
    const invalid = await invoke(missingHandler, {
      method: 'PATCH', query: { id: dishId }, body,
    });
    assert.equal(invalid.statusCode, 400);
  }
  assert.equal(calls, 0);
  const missing = await invoke(missingHandler, {
    method: 'PATCH', query: { id: dishId }, body: { name: 'Tea' },
  });
  assert.equal(missing.statusCode, 404);

  const deleted = await invoke(createDishHandler({
    authorize: authorized,
    query: async () => [{ id: dishId }],
  }), { method: 'DELETE', query: { id: dishId } });
  assert.equal(deleted.statusCode, 200);
  assert.deepEqual(deleted.body, { deleted: true });

  const failure = await invoke(createDishHandler({
    authorize: authorized,
    query: async () => { throw new Error('password=secret'); },
  }), { method: 'DELETE', query: { id: dishId } });
  assert.equal(failure.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(failure.body), /password|secret/i);

  const wrongMethod = await invoke(missingHandler, {
    method: 'GET', query: { id: dishId },
  });
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.headers.allow, 'PATCH, DELETE');
});
