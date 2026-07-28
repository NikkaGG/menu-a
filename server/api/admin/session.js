const { authorizeAdmin } = require('../_lib/admin-auth');
const { json, methodNotAllowed } = require('../_lib/response');

function createAdminSessionHandler({
  env = process.env,
  now = Date.now,
  authorize = (request) => authorizeAdmin(request, env, now),
} = {}) {
  return async (request, response) => {
    if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
    try {
      if (await authorize(request)) {
        return json(response, 200, { authenticated: true });
      }
    } catch {}
    return json(response, 401, { error: 'Unauthorized' });
  };
}

async function handler(request, response) {
  return createAdminSessionHandler()(request, response);
}

module.exports = Object.assign(handler, { handler, createAdminSessionHandler });
