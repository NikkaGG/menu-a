const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const VERSION = 'v2';
const COST = 131072;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const MAX_PASSWORD_LENGTH = 1024;
const HASH_PATTERN = /^scrypt\$v2\$131072\$8\$1\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/;
const SCRYPT_OPTIONS = {
  N: COST,
  r: BLOCK_SIZE,
  p: PARALLELIZATION,
  maxmem: 256 * 1024 * 1024,
};

function validPassword(password) {
  return typeof password === 'string'
    && password.length > 0
    && password.length <= MAX_PASSWORD_LENGTH;
}

async function derive(password, salt) {
  return scrypt(password, salt, KEY_BYTES, SCRYPT_OPTIONS);
}

async function hashPassword(password) {
  if (!validPassword(password)) throw new TypeError('Password must be between 1 and 1024 characters');
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await derive(password, salt);
  return `scrypt$${VERSION}$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}`
    + `$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

async function verifyPasswordHash(password, encodedHash) {
  if (!validPassword(password) || typeof encodedHash !== 'string') return false;
  const match = HASH_PATTERN.exec(encodedHash);
  if (!match) return false;
  try {
    const salt = Buffer.from(match[1], 'base64url');
    const expected = Buffer.from(match[2], 'base64url');
    if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) return false;
    const actual = await derive(password, salt);
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

module.exports = {
  hashPassword,
  verifyPasswordHash,
};
