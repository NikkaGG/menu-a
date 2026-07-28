const crypto = require('node:crypto');
const {
  createAdminSessionCookie,
  createAdminSessionToken,
} = require('../_lib/admin-auth');
const { verifyPasswordHash } = require('../_lib/admin-password');
const { getQuery } = require('../_lib/db');
const { json, methodNotAllowed } = require('../_lib/response');

const MAX_FAILURES = 5;
const EXPIRED_ATTEMPT_CLEANUP_LIMIT = 100;
const PASSWORD_HASH_PATTERN = /^scrypt\$v2\$131072\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/;
const CLEANUP_EXPIRED_ATTEMPTS_SQL = `WITH expired_attempts AS (
  SELECT client_key
  FROM admin_login_attempts
  WHERE expires_at <= to_timestamp($1 / 1000.0)
  ORDER BY expires_at
  LIMIT ${EXPIRED_ATTEMPT_CLEANUP_LIMIT}
)
DELETE FROM admin_login_attempts
USING expired_attempts
WHERE admin_login_attempts.client_key = expired_attempts.client_key
  AND admin_login_attempts.expires_at <= to_timestamp($1 / 1000.0)`;
const FIND_ATTEMPT_SQL = `SELECT
  GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expires_at - to_timestamp($2 / 1000.0)))))::int AS retry_after
FROM admin_login_attempts
WHERE client_key = $1
  AND expires_at > to_timestamp($2 / 1000.0)`;
const RESERVE_ATTEMPT_SQL = `INSERT INTO admin_login_attempts (client_key, failure_count, expires_at)
VALUES ($1, 1, to_timestamp($2 / 1000.0) + interval '15 minutes')
ON CONFLICT (client_key) DO UPDATE SET
  failure_count = CASE
    WHEN admin_login_attempts.expires_at <= to_timestamp($2 / 1000.0) THEN 1
    ELSE admin_login_attempts.failure_count + 1
  END,
  expires_at = CASE
    WHEN admin_login_attempts.expires_at <= to_timestamp($2 / 1000.0)
      THEN to_timestamp($2 / 1000.0) + interval '15 minutes'
    ELSE admin_login_attempts.expires_at
  END
WHERE admin_login_attempts.expires_at <= to_timestamp($2 / 1000.0)
  OR admin_login_attempts.failure_count < ${MAX_FAILURES}
RETURNING failure_count,
  (EXTRACT(EPOCH FROM expires_at) * 1000)::bigint AS window_expires_at`;
const RELEASE_ATTEMPT_SQL = `WITH reserved_attempt AS (
  SELECT client_key, failure_count
  FROM admin_login_attempts
  WHERE client_key = $1
    AND expires_at = to_timestamp($2 / 1000.0)
  FOR UPDATE
),
deleted AS (
  DELETE FROM admin_login_attempts AS attempts
  USING reserved_attempt
  WHERE attempts.client_key = reserved_attempt.client_key
    AND reserved_attempt.failure_count = 1
  RETURNING attempts.client_key
),
decremented AS (
  UPDATE admin_login_attempts AS attempts
  SET failure_count = attempts.failure_count - 1
  FROM reserved_attempt
  WHERE attempts.client_key = reserved_attempt.client_key
    AND reserved_attempt.failure_count > 1
  RETURNING attempts.client_key
)
SELECT client_key FROM deleted
UNION ALL
SELECT client_key FROM decremented`;

function validEnvironment(env) {
  return typeof env?.ADMIN_LOGIN === 'string'
    && env.ADMIN_LOGIN.length > 0
    && env.ADMIN_LOGIN.length <= 1024
    && typeof env.ADMIN_PASSWORD_HASH === 'string'
    && PASSWORD_HASH_PATTERN.test(env.ADMIN_PASSWORD_HASH)
    && typeof env.ADMIN_SESSION_SECRET === 'string'
    && env.ADMIN_SESSION_SECRET.length >= 32
    && env.ADMIN_SESSION_SECRET.length <= 1024;
}

function exactCredentials(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const keys = Object.keys(body);
  return keys.length === 2
    && keys.includes('login')
    && keys.includes('password')
    && typeof body.login === 'string'
    && typeof body.password === 'string';
}

function clientKey(request, secret) {
  const forwardedFor = request?.headers?.['x-vercel-forwarded-for'];
  const trustedIp = typeof forwardedFor === 'string' && forwardedFor.length > 0
    ? forwardedFor
    : 'unknown';
  return crypto.createHmac('sha256', secret).update(trustedIp).digest('hex');
}

function createAdminLoginHandler({
  env = process.env,
  now = Date.now,
  query,
  verifyPassword = verifyPasswordHash,
} = {}) {
  return async (request, response) => {
    if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
    if (!validEnvironment(env)) return json(response, 503, { error: 'Unable to sign in' });

    try {
      const execute = query || getQuery();
      const currentTime = now();
      const key = clientKey(request, env.ADMIN_SESSION_SECRET);
      await execute(CLEANUP_EXPIRED_ATTEMPTS_SQL, [currentTime]);
      const [reservation] = await execute(RESERVE_ATTEMPT_SQL, [key, currentTime]);
      if (!reservation) {
        const [state] = await execute(FIND_ATTEMPT_SQL, [key, currentTime]);
        if (state && !Number.isInteger(state.retry_after)) {
          throw new Error('Invalid limiter state');
        }
        return json(response, 429, { error: 'Unable to sign in' }, {
          'Retry-After': state?.retry_after || 900,
        });
      }
      const windowExpiresAt = Number(reservation.window_expires_at);
      if (!Number.isInteger(reservation.failure_count)
        || !Number.isFinite(windowExpiresAt)) {
        throw new Error('Invalid limiter reservation');
      }

      const credentialsValid = exactCredentials(request.body);
      const passwordValid = credentialsValid
        ? await verifyPassword(request.body.password, env.ADMIN_PASSWORD_HASH)
        : false;
      if (!credentialsValid || request.body.login !== env.ADMIN_LOGIN || !passwordValid) {
        return json(response, 401, { error: 'Unable to sign in' });
      }

      const released = await execute(RELEASE_ATTEMPT_SQL, [key, windowExpiresAt]);
      if (released.length !== 1) throw new Error('Unable to release limiter reservation');
      const token = createAdminSessionToken(env.ADMIN_SESSION_SECRET, currentTime);
      response.setHeader(
        'Set-Cookie',
        createAdminSessionCookie(token, env.NODE_ENV === 'production'),
      );
      return json(response, 200, { ok: true });
    } catch {
      return json(response, 503, { error: 'Unable to sign in' });
    }
  };
}

async function handler(request, response) {
  return createAdminLoginHandler()(request, response);
}

module.exports = Object.assign(handler, { handler, createAdminLoginHandler });
