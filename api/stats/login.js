const { safeEqual, createSessionToken, createSessionCookie } = require('../_lib/auth');
const { json, methodNotAllowed } = require('../_lib/response');
const { clientIp } = require('../events');

const BLOCK_MS = 15 * 60 * 1000;
const MAX_FAILURE_ENTRIES = 10000;
const loginFailures = new Map();

function requiredEnvironment(env) {
  if (!env.STATS_PASSWORD) throw new Error('STATS_PASSWORD is required');
  if (!env.STATS_SESSION_SECRET) throw new Error('STATS_SESSION_SECRET is required');
}

function createLoginHandler({
  env = process.env,
  now = Date.now,
  failures = loginFailures,
  maxFailureEntries = MAX_FAILURE_ENTRIES,
} = {}) {
  requiredEnvironment(env);
  return async (request, response) => {
    if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
    const ip = clientIp(request);
    const currentTime = now();
    for (const [storedIp, failure] of failures) {
      if (currentTime - failure.lastFailure >= BLOCK_MS) failures.delete(storedIp);
    }
    const state = failures.get(ip);
    if (state && state.count >= 5 && currentTime - state.lastFailure < BLOCK_MS) {
      return json(response, 429, { error: 'Unable to sign in' }, { 'Retry-After': 900 });
    }
    const password = request.body?.password;
    if (typeof password !== 'string' || !safeEqual(password, env.STATS_PASSWORD)) {
      if (!state && failures.size >= maxFailureEntries) {
        return json(response, 429, { error: 'Unable to sign in' }, { 'Retry-After': 900 });
      }
      failures.set(ip, {
        count: state && currentTime - state.lastFailure < BLOCK_MS ? state.count + 1 : 1,
        lastFailure: currentTime,
      });
      return json(response, 401, { error: 'Unable to sign in' });
    }
    failures.delete(ip);
    const token = createSessionToken(env.STATS_SESSION_SECRET, currentTime);
    response.setHeader('Set-Cookie', createSessionCookie(token, env.NODE_ENV === 'production'));
    return json(response, 200, { ok: true });
  };
}

async function handler(request, response) {
  return createLoginHandler()(request, response);
}

module.exports = Object.assign(handler, { handler, createLoginHandler });
