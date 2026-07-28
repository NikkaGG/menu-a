const { randomBytes } = require('node:crypto');

function generateTableToken() {
  return randomBytes(16).toString('base64url').slice(0, 21);
}

module.exports = { generateTableToken };
