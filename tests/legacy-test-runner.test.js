const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('root package defines separate legacy and unit test commands', () => {
  const pkg = require(path.join(root, 'package.json'));

  assert.equal(pkg.scripts['test:legacy'], 'node scripts/run-node-tests.js');
  assert.equal(pkg.scripts['test:unit'], 'vitest run --config admin-app/vitest.config.ts');
});

test('Node version and generated admin output are pinned', () => {
  assert.equal(fs.readFileSync(path.join(root, '.nvmrc'), 'utf8'), '20.19.0\n');
  const ignored = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split(/\r?\n/);
  assert.ok(ignored.includes('admin-dist/'));
});

test('legacy runner explicitly and deterministically enumerates tests/*.test.js', () => {
  const { enumerateTests } = require(path.join(root, 'scripts', 'run-node-tests.js'));
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-runner-'));
  fs.mkdirSync(path.join(fixture, 'tests'));
  for (const file of ['z.test.js', 'a.test.js', 'helper.js', 'nested.test.ts']) {
    fs.writeFileSync(path.join(fixture, 'tests', file), '');
  }

  assert.deepEqual(
    enumerateTests(fixture).map((file) => path.relative(fixture, file).replaceAll('\\', '/')),
    ['tests/a.test.js', 'tests/z.test.js'],
  );
});

test('legacy discovery still enumerates focused contract test files', () => {
  const { enumerateTests } = require(path.join(root, 'scripts', 'run-node-tests.js'));

  assert.ok(enumerateTests(root).some((file) => file.endsWith('tests\\admin-build.test.js') || file.endsWith('tests/admin-build.test.js')));
  assert.ok(enumerateTests(root).some((file) => file.endsWith('tests\\legacy-test-runner.test.js') || file.endsWith('tests/legacy-test-runner.test.js')));
});

test('legacy runner preserves the Node test process exit code', () => {
  const { runNodeTests } = require(path.join(root, 'scripts', 'run-node-tests.js'));
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-runner-exit-'));
  fs.mkdirSync(path.join(fixture, 'tests'));
  fs.writeFileSync(path.join(fixture, 'tests', 'failure.test.js'), '');

  assert.equal(runNodeTests(fixture, { spawnSync: () => ({ status: 7 }) }), 7);
});
