const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('pins the Railway bot runtime to Python 3.11', () => {
  const versionFile = path.join(__dirname, '..', '.python-version');

  assert.equal(fs.readFileSync(versionFile, 'utf8'), '3.11');
});
