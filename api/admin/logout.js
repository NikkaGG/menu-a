const { createExpiredAdminSessionCookie } = require('../_lib/admin-auth');
const { json, methodNotAllowed } = require('../_lib/response');

function createAdminLogoutHandler({ env = process.env } = {}) {
  return async (request, response) => {
    if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
    response.setHeader(
      'Set-Cookie',
      createExpiredAdminSessionCookie(env.NODE_ENV === 'production'),
    );
    return json(response, 200, { ok: true });
  };
}

async function handler(request, response) {
  return createAdminLogoutHandler()(request, response);
}

module.exports = Object.assign(handler, { handler, createAdminLogoutHandler });
