const crypto = require('node:crypto');
const { json } = require('./response');

const ADMIN_COOKIE_NAME = 'admin_session';
const ADMIN_SESSION_SECONDS = 12 * 60 * 60;
const TOKEN_PURPOSE = 'admin';
const TOKEN_VERSION = 1;

function validSecret(secret) {
  return typeof secret === 'string' && secret.length >= 32 && secret.length <= 1024;
}

function signature(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest();
}

function createAdminSessionToken(secret, now = Date.now()) {
  if (!validSecret(secret)) throw new Error('ADMIN_SESSION_SECRET is invalid');
  const payload = Buffer.from(JSON.stringify({
    purpose: TOKEN_PURPOSE,
    version: TOKEN_VERSION,
    exp: Math.floor(now / 1000) + ADMIN_SESSION_SECONDS,
  })).toString('base64url');
  return `${payload}.${signature(payload, secret).toString('base64url')}`;
}

function verifyAdminSessionToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || !validSecret(secret)) return false;
  const match = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  try {
    const supplied = Buffer.from(match[2], 'base64url');
    const expected = signature(match[1], secret);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return false;
    const payload = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
    const keys = Object.keys(payload);
    if (keys.length !== 3 || !keys.includes('purpose') || !keys.includes('version') || !keys.includes('exp')) {
      return false;
    }
    return payload.purpose === TOKEN_PURPOSE
      && payload.version === TOKEN_VERSION
      && Number.isInteger(payload.exp)
      && Math.floor(now / 1000) < payload.exp;
  } catch {
    return false;
  }
}

function createAdminSessionCookie(token, secure) {
  const secureAttribute = secure ? '; Secure' : '';
  return `${ADMIN_COOKIE_NAME}=${token}${secureAttribute}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ADMIN_SESSION_SECONDS}`;
}

function createExpiredAdminSessionCookie(secure = process.env.NODE_ENV === 'production') {
  const secureAttribute = secure ? '; Secure' : '';
  return `${ADMIN_COOKIE_NAME}=${secureAttribute}; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

function readAdminSessionCookie(cookieHeader) {
  if (typeof cookieHeader !== 'string') return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === ADMIN_COOKIE_NAME) return value.join('=') || null;
  }
  return null;
}

async function authorizeAdmin(request, env = process.env, now = Date.now) {
  const token = readAdminSessionCookie(request?.headers?.cookie);
  return verifyAdminSessionToken(token, env?.ADMIN_SESSION_SECRET, now());
}

async function requireAdmin(request, response, authorize = authorizeAdmin) {
  try {
    if (await authorize(request)) return true;
  } catch {}
  json(response, 401, { error: 'Unauthorized' });
  return false;
}

module.exports = {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_SECONDS,
  createAdminSessionToken,
  verifyAdminSessionToken,
  createAdminSessionCookie,
  createExpiredAdminSessionCookie,
  readAdminSessionCookie,
  authorizeAdmin,
  requireAdmin,
};
