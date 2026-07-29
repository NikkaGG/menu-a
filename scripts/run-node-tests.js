const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CONTRACT_TESTS = new Set(['admin-build.test.js', 'legacy-test-runner.test.js']);

function enumerateTests(rootDir) {
  const testsDir = path.join(rootDir, 'tests');
  return fs.readdirSync(testsDir)
    .filter((name) => name.endsWith('.test.js'))
    .sort()
    .map((name) => path.join(testsDir, name));
}

function runNodeTests(rootDir = path.resolve(__dirname, '..'), options = {}) {
  const legacyTests = enumerateTests(rootDir).filter((file) => !CONTRACT_TESTS.has(path.basename(file)));
  const result = (options.spawnSync || spawnSync)(process.execPath, ['--test', ...legacyTests], {
    cwd: rootDir,
    stdio: options.stdio || 'inherit',
  });
  return typeof result.status === 'number' ? result.status : 1;
}

if (require.main === module) {
  process.exitCode = runNodeTests();
}

module.exports = { enumerateTests, runNodeTests };
