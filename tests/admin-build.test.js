const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('root package pins the admin build contract', () => {
  const pkg = require(path.join(root, 'package.json'));

  assert.equal(pkg.engines.node, '20.19.x');
  assert.equal(pkg.scripts.build, 'node scripts/build-admin.js');
  assert.equal(pkg.scripts.test, 'npm run test:legacy && npm run test:unit');
  assert.equal(pkg.scripts.typecheck, 'tsc --noEmit -p admin-app/tsconfig.json');
  assert.equal(pkg.scripts.lint, 'eslint admin-app');
  assert.equal(pkg.scripts.test_browser, undefined);
  assert.equal(pkg.scripts['test:browser'], 'playwright test --config admin-app/playwright.config.ts');
});

test('admin build verification preserves public ordering and API files', () => {
  const { verifyBuildOutput } = require(path.join(root, 'scripts', 'build-admin.js'));
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-build-'));
  fs.mkdirSync(path.join(fixture, 'admin-dist', 'assets'), { recursive: true });
  fs.mkdirSync(path.join(fixture, 'api'));
  fs.writeFileSync(path.join(fixture, 'admin-dist', 'index.html'), '<script src="/admin-dist/assets/index-Ab12cd34.js"></script>');
  fs.writeFileSync(path.join(fixture, 'admin-dist', 'assets', 'index-Ab12cd34.js'), '');
  for (const file of ['index.html', 'menu.html', 'qr-ordering.js']) {
    fs.writeFileSync(path.join(fixture, file), '');
  }
  fs.writeFileSync(path.join(fixture, 'api', 'router.js'), '');

  assert.doesNotThrow(() => verifyBuildOutput(fixture));
});

test('admin build reports a clear missing app error', () => {
  const { buildAdmin } = require(path.join(root, 'scripts', 'build-admin.js'));
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-build-missing-'));

  assert.throws(
    () => buildAdmin({ rootDir: fixture, runVite: () => 0 }),
    /admin-app directory is required/i,
  );
});
