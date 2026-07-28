const handlers = {
  events: require('../server/api/events'),
  menu: require('../server/api/menu'),
  table: require('../server/api/tables/[token]'),
  orders: require('../server/api/orders'),
  'order-details': require('../server/api/orders/[id]'),
  'order-status': require('../server/api/orders/[id]/status'),
  'telegram-message': require('../server/api/orders/[id]/telegram-message'),
  'waiter-message': require('../server/api/orders/[id]/waiter-message'),
  'waiter-notification-claim': require('../server/api/orders/[id]/waiter-notification-claim'),
  'sessions-open': require('../server/api/sessions/open'),
  'session-bill': require('../server/api/sessions/[id]/bill'),
  'session-close': require('../server/api/sessions/[id]/close'),
  stats: require('../server/api/stats'),
  'stats-login': require('../server/api/stats/login'),
  'stats-logout': require('../server/api/stats/logout'),
  'admin-login': require('../server/api/admin/login'),
  'admin-logout': require('../server/api/admin/logout'),
  'admin-session': require('../server/api/admin/session'),
  'admin-stats': require('../server/api/admin/stats'),
  'admin-categories': require('../server/api/admin/categories'),
  'admin-category': require('../server/api/admin/categories/[id]'),
  'admin-dishes': require('../server/api/admin/dishes'),
  'admin-dish': require('../server/api/admin/dishes/[id]'),
  'admin-tables': require('../server/api/admin/tables'),
  'admin-table': require('../server/api/admin/tables/[id]'),
  'admin-table-qr': require('../server/api/admin/tables/[id]/qr'),
};

const routes = [
  ['events', /^\/api\/events$/],
  ['menu', /^\/api\/menu$/],
  ['orders', /^\/api\/orders$/],
  ['sessions-open', /^\/api\/sessions\/open$/],
  ['stats-login', /^\/api\/stats\/login$/],
  ['stats-logout', /^\/api\/stats\/logout$/],
  ['stats', /^\/api\/stats$/],
  ['admin-login', /^\/api\/admin\/login$/],
  ['admin-logout', /^\/api\/admin\/logout$/],
  ['admin-session', /^\/api\/admin\/session$/],
  ['admin-stats', /^\/api\/admin\/stats$/],
  ['admin-categories', /^\/api\/admin\/categories$/],
  ['admin-dishes', /^\/api\/admin\/dishes$/],
  ['admin-tables', /^\/api\/admin\/tables$/],
  ['admin-table-qr', /^\/api\/admin\/tables\/([^/]+)\/qr$/, ['id']],
  ['admin-category', /^\/api\/admin\/categories\/([^/]+)$/, ['id']],
  ['admin-dish', /^\/api\/admin\/dishes\/([^/]+)$/, ['id']],
  ['admin-table', /^\/api\/admin\/tables\/([^/]+)$/, ['id']],
  ['order-status', /^\/api\/orders\/([^/]+)\/status$/, ['id']],
  ['telegram-message', /^\/api\/orders\/([^/]+)\/telegram-message$/, ['id']],
  ['waiter-message', /^\/api\/orders\/([^/]+)\/waiter-message$/, ['id']],
  ['waiter-notification-claim', /^\/api\/orders\/([^/]+)\/waiter-notification-claim$/, ['id']],
  ['order-details', /^\/api\/orders\/([^/]+)$/, ['id']],
  ['session-bill', /^\/api\/sessions\/([^/]+)\/bill$/, ['id']],
  ['session-close', /^\/api\/sessions\/([^/]+)\/close$/, ['id']],
  ['table', /^\/api\/tables\/([^/]+)$/, ['token']],
];

function matchRoute(url) {
  let pathname;
  try {
    pathname = new URL(url, 'http://localhost').pathname.replace(/\/+$/, '') || '/';
  } catch {
    return null;
  }

  for (const [name, pattern, parameterNames = []] of routes) {
    const match = pattern.exec(pathname);
    if (!match) continue;

    try {
      const params = Object.fromEntries(
        parameterNames.map((parameter, index) => [parameter, decodeURIComponent(match[index + 1])]),
      );
      return { name, params };
    } catch {
      return null;
    }
  }
  return null;
}

function requestUrlForMatch(request) {
  let pathname;
  try {
    pathname = new URL(request.url, 'http://localhost').pathname;
  } catch {
    return request.url;
  }
  if (pathname !== '/api/router') return request.url;

  const forwardedPath = request.query && request.query.path;
  if (Array.isArray(forwardedPath)) return `/api/${forwardedPath.join('/')}`;
  if (typeof forwardedPath === 'string') return `/api/${forwardedPath}`;
  return request.url;
}

function createRouter(routeHandlers = handlers) {
  return async function router(request, response) {
    const match = matchRoute(requestUrlForMatch(request));
    if (!match || typeof routeHandlers[match.name] !== 'function') {
      return response.status(404).json({ error: 'Not found' });
    }

    request.query = { ...request.query, ...match.params };
    delete request.query.path;
    return routeHandlers[match.name](request, response);
  };
}

const handler = createRouter();

module.exports = Object.assign(handler, {
  handler,
  matchRoute,
  createRouter,
});
