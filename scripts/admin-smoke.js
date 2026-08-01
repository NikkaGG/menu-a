const RETRY_DELAYS = [250, 1000, 2000];
const TRANSIENT_CLEANUP_STATUSES = new Set([408, 425, 429]);

function requiredEnvironment(env) {
  const common = ['ADMIN_SMOKE_BASE_URL', 'ADMIN_SMOKE_LOGIN', 'ADMIN_SMOKE_PASSWORD'];
  const mode = env.ADMIN_SMOKE_MODE?.trim() || 'readonly';
  if (!['readonly', 'preview-mutation'].includes(mode)) {
    throw new Error('ADMIN_SMOKE_MODE must be readonly or preview-mutation');
  }
  const mutationRequired = [
    'ADMIN_SMOKE_ENVIRONMENT',
    'ADMIN_SMOKE_MUTATION_CONFIRM',
    'ADMIN_SMOKE_PREFIX',
  ];
  const required = mode === 'preview-mutation'
    ? [...common, ...mutationRequired]
    : [...common, 'ADMIN_SMOKE_READONLY_TABLE_ID'];
  const missing = required.filter((name) => typeof env[name] !== 'string' || !env[name].trim());
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  if (mode === 'preview-mutation'
    && (env.ADMIN_SMOKE_ENVIRONMENT !== 'preview'
      || env.ADMIN_SMOKE_MUTATION_CONFIRM !== 'preview-only')) {
    throw new Error('Preview mutation requires a preview environment and preview-only confirmation');
  }
  let baseUrl;
  try {
    baseUrl = new URL(env.ADMIN_SMOKE_BASE_URL);
  } catch {
    throw new Error('ADMIN_SMOKE_BASE_URL must be a valid HTTP(S) URL');
  }
  if (!['http:', 'https:'].includes(baseUrl.protocol)) {
    throw new Error('ADMIN_SMOKE_BASE_URL must be a valid HTTP(S) URL');
  }
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash || baseUrl.pathname !== '/') {
    throw new Error('ADMIN_SMOKE_BASE_URL must be an origin URL with a root path');
  }
  return {
    baseUrl: baseUrl.href,
    login: env.ADMIN_SMOKE_LOGIN,
    password: env.ADMIN_SMOKE_PASSWORD,
    mode,
    prefix: env.ADMIN_SMOKE_PREFIX?.trim() || null,
    readonlyTableId: env.ADMIN_SMOKE_READONLY_TABLE_ID?.trim() || null,
  };
}

function cookieFrom(response) {
  const setCookie = response.headers.get('set-cookie');
  const cookie = setCookie?.split(';', 1)[0]?.trim();
  if (!cookie || !cookie.includes('=') || /[\r\n]/.test(cookie)) {
    throw new Error('Admin smoke authentication did not return a valid session cookie');
  }
  return cookie;
}

function transientCleanupStatus(status) {
  return TRANSIENT_CLEANUP_STATUSES.has(status) || (status >= 500 && status <= 599);
}

async function cleanupResource({ path, request, sleep }) {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
    let response;
    try {
      response = await request(path, { method: 'DELETE' });
    } catch {
      if (attempt === RETRY_DELAYS.length) throw new Error(`Cleanup failed for ${path}`);
      await sleep(RETRY_DELAYS[attempt]);
      continue;
    }
    if (response.ok || response.status === 404) return;
    if (!transientCleanupStatus(response.status) || attempt === RETRY_DELAYS.length) {
      throw new Error(`Cleanup failed for ${path} with HTTP ${response.status}`);
    }
    await sleep(RETRY_DELAYS[attempt]);
  }
}

function assetPaths(content) {
  return [...content.matchAll(/(?:src|href)=["']([^"']+)["']|url\((?:["']?)([^"'()]+)(?:["']?)\)/g)]
    .map((match) => match[1] || match[2])
    .filter((value) => value.startsWith('/admin-dist/assets/'));
}

async function verifyShell(request) {
  const routes = ['/admin-next', '/admin-next/menu', '/admin-next/tables', '/admin-next/stats'];
  let shell;
  for (const route of routes) {
    const response = await request(route);
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('text/html')) throw new Error(`Admin smoke shell check failed for ${route}`);
    const html = await response.text();
    if (!shell) shell = html;
  }

  const pending = assetPaths(shell || '');
  if (!pending.length) throw new Error('Admin smoke shell did not reference built assets');
  const checked = new Set();
  while (pending.length) {
    const asset = pending.shift();
    if (checked.has(asset)) continue;
    checked.add(asset);
    const response = await request(asset);
    if (!response.ok) throw new Error('Admin smoke asset check failed');
    if (asset.endsWith('.css')) pending.push(...assetPaths(await response.text()));
  }
}

function expectEntity(body, key, expectedId) {
  if (!Array.isArray(body[key]) || !body[key].some((item) => item && item.id === expectedId)) {
    throw new Error(`Admin smoke ${key} list verification failed`);
  }
}

function uniqueResourceNames(prefix, timestamp, randomValue) {
  const runId = `${timestamp}-${Math.floor(randomValue * 1000000000)}`;
  const bounded = (label, maximum) => {
    const suffix = `-${runId}-${label}`;
    return `${prefix.slice(0, Math.max(0, maximum - suffix.length))}${suffix}`;
  };
  return {
    category: bounded('category', 200),
    dish: bounded('dish', 200),
    table: bounded('table', 100),
  };
}

async function runAdminSmoke(options = {}) {
  const {
    env = process.env,
    fetchImpl = globalThis.fetch,
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    logger = console,
    now = Date.now,
    random = Math.random,
  } = options;
  const config = requiredEnvironment(env);
  if (typeof fetchImpl !== 'function') throw new Error('Admin smoke requires a fetch implementation');
  let cookie;

  const request = async (requestPath, init = {}, rawResponse = false) => {
    const method = init.method || 'GET';
    const headers = { ...(init.headers || {}) };
    if (cookie) headers.Cookie = cookie;
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetchImpl(new URL(requestPath, config.baseUrl), {
        ...init,
        method,
        headers,
        redirect: 'manual',
      });
    } catch {
      throw new Error(`Admin smoke network request failed for ${method} ${requestPath}`);
    }
    if (rawResponse) return response;
    if (!response.ok) throw new Error(`Admin smoke request failed for ${method} ${requestPath} with HTTP ${response.status}`);
    return response;
  };

  const jsonRequest = async (requestPath, init = {}) => {
    const response = await request(requestPath, init);
    try {
      return await response.json();
    } catch {
      throw new Error(`Admin smoke received an invalid response for ${init.method || 'GET'} ${requestPath}`);
    }
  };

  const loginResponse = await request('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ login: config.login, password: config.password }),
  });
  cookie = cookieFrom(loginResponse);

  try {
    await verifyShell(request);
    const session = await jsonRequest('/api/admin/session');
    if (session.authenticated !== true) throw new Error('Admin smoke session verification failed');
    const date = new Date(now()).toISOString().slice(0, 10);
    await jsonRequest(`/api/admin/stats?from=${date}&to=${date}&groupBy=day`);

    if (config.mode === 'readonly') {
      await jsonRequest('/api/admin/categories');
      await jsonRequest('/api/admin/dishes');
      const tables = await jsonRequest('/api/admin/tables');
      expectEntity(tables, 'tables', config.readonlyTableId);
      const qr = await request(`/api/admin/tables/${encodeURIComponent(config.readonlyTableId)}/qr`);
      if (!(qr.headers.get('content-type') || '').includes('image/png')) {
        throw new Error('Admin smoke QR verification failed');
      }
      logger.log('Admin smoke read-only checks passed');
      return { mode: 'readonly' };
    }

    const names = uniqueResourceNames(config.prefix, now(), random());
    const created = {};
    try {
      const categoryBody = await jsonRequest('/api/admin/categories', {
        method: 'POST',
        body: JSON.stringify({ name: names.category, sort_order: 0 }),
      });
      created.category = categoryBody.category?.id;
      if (!created.category) throw new Error('Admin smoke category creation failed');

      const dishBody = await jsonRequest('/api/admin/dishes', {
        method: 'POST',
        body: JSON.stringify({
          category_id: created.category,
          name: names.dish,
          price: 1,
          is_available: true,
          sort_order: 0,
        }),
      });
      created.dish = dishBody.dish?.id;
      if (!created.dish) throw new Error('Admin smoke dish creation failed');

      const tableBody = await jsonRequest('/api/admin/tables', {
        method: 'POST',
        body: JSON.stringify({ number: names.table }),
      });
      created.table = tableBody.table?.id;
      if (!created.table) throw new Error('Admin smoke table creation failed');

      expectEntity(await jsonRequest('/api/admin/categories'), 'categories', created.category);
      expectEntity(await jsonRequest('/api/admin/dishes'), 'dishes', created.dish);
      expectEntity(await jsonRequest('/api/admin/tables'), 'tables', created.table);
      const qr = await request(`/api/admin/tables/${encodeURIComponent(created.table)}/qr`);
      if (!(qr.headers.get('content-type') || '').includes('image/png')) {
        throw new Error('Admin smoke QR verification failed');
      }
      logger.log('Admin smoke preview checks passed');
      return { mode: 'preview', tableId: created.table };
    } finally {
      const cleanup = (resource, id) => id && cleanupResource({
        path: `/api/admin/${resource}/${encodeURIComponent(id)}`,
        request: (cleanupPath, init) => request(cleanupPath, init, true),
        sleep,
      });
      const cleanupErrors = [];
      for (const [resource, id] of [
        ['tables', created.table],
        ['dishes', created.dish],
        ['categories', created.category],
      ]) {
        try {
          await cleanup(resource, id);
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      if (cleanupErrors.length) throw cleanupErrors[0];
    }
  } finally {
    if (cookie) {
      await request('/api/admin/logout', { method: 'POST' });
      cookie = undefined;
    }
  }
}

async function main() {
  try {
    await runAdminSmoke();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Admin smoke failed');
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  cleanupResource,
  requiredEnvironment,
  runAdminSmoke,
  uniqueResourceNames,
};
