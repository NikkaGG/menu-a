const { createExpiredSessionCookie } = require('../_lib/auth');
const { json, methodNotAllowed } = require('../_lib/response');

async function logoutHandler(request, response) {
  if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
  response.setHeader('Set-Cookie', createExpiredSessionCookie(process.env.NODE_ENV === 'production'));
  return json(response, 200, { ok: true });
}

async function handler(request, response) {
  return logoutHandler(request, response);
}

module.exports = Object.assign(handler, { handler, logoutHandler });
