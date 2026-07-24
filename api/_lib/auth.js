const crypto = require('node:crypto');

const COOKIE_NAME = 'stats_session';
const SESSION_SECONDS = 12 * 60 * 60;

function safeEqual(left, right) {
  const leftDigest = crypto.createHash('sha256').update(String(left)).digest();
  const rightDigest = crypto.createHash('sha256').update(String(right)).digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

function signature(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function createSessionToken(secret, now = Date.now()) {
  if (!secret) throw new Error('STATS_SESSION_SECRET is required');
  const expiresAt = Math.floor(now / 1000) + SESSION_SECONDS;
  const payload = Buffer.from(JSON.stringify({ exp: expiresAt })).toString('base64url');
  return `${payload}.${signature(payload, secret)}`;
}

function verifySessionToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || !secret) return false;
  const separator = token.indexOf('.');
  if (separator < 1 || token.indexOf('.', separator + 1) !== -1) return false;
  const payload = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  if (!safeEqual(suppliedSignature, signature(payload, secret))) return false;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isInteger(value.exp) && Math.floor(now / 1000) < value.exp;
  } catch {
    return false;
  }
}

function createSessionCookie(token, secure) {
  const secureAttribute = secure ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}${secureAttribute}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`;
}

function createExpiredSessionCookie(secure = process.env.NODE_ENV === 'production') {
  const secureAttribute = secure ? '; Secure' : '';
  return `${COOKIE_NAME}=${secureAttribute}; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

function readSessionCookie(cookieHeader) {
  if (typeof cookieHeader !== 'string') return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === COOKIE_NAME) return value.join('=') || null;
  }
  return null;
}

module.exports = {
  COOKIE_NAME,
  SESSION_SECONDS,
  safeEqual,
  createSessionToken,
  verifySessionToken,
  createSessionCookie,
  createExpiredSessionCookie,
  readSessionCookie,
};
