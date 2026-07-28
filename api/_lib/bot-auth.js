const { createHash, timingSafeEqual } = require('node:crypto');
const { json } = require('./response');

const MIN_SECRET_LENGTH = 32;
const MAX_SECRET_LENGTH = 1024;
const UNAUTHORIZED = { error: 'Unauthorized' };

function constantTimeEqual(left, right) {
  if (!Buffer.isBuffer(left) || !Buffer.isBuffer(right)) return false;
  const leftDigest = createHash('sha256').update(left).digest();
  const rightDigest = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function configuredSecret(env) {
  const secret = env?.BOT_INTERNAL_API_SECRET;
  if (typeof secret !== 'string'
    || secret.length < MIN_SECRET_LENGTH
    || secret.length > MAX_SECRET_LENGTH) {
    return null;
  }
  return secret;
}

function createBotAuthorizer({ env = process.env } = {}) {
  return async (request, response) => {
    const secret = configuredSecret(env);
    const authorization = request?.headers?.authorization
      ?? request?.headers?.Authorization;
    const match = typeof authorization === 'string'
      ? /^Bearer ([^\s]+)$/.exec(authorization)
      : null;
    const supplied = match ? Buffer.from(match[1], 'utf8') : null;
    const expected = secret ? Buffer.from(secret, 'utf8') : null;
    if (!supplied || !expected || !constantTimeEqual(supplied, expected)) {
      json(response, 401, UNAUTHORIZED);
      return false;
    }
    return true;
  };
}

const authorizeBotRequest = createBotAuthorizer();

module.exports = {
  authorizeBotRequest,
  constantTimeEqual,
  createBotAuthorizer,
};
