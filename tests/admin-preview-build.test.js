const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('preview rewrites preserve the API router and production admin routes', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

  assert.deepEqual(config.rewrites, [
    { source: '/api/:path*', destination: '/api/router?path=:path*' },
    { source: '/t/:token', destination: '/index.html' },
    { source: '/order/:id', destination: '/index.html' },
    { source: '/admin', destination: '/admin.html' },
    { source: '/admin/menu', destination: '/admin.html' },
    { source: '/admin/tables', destination: '/admin.html' },
    { source: '/stats', destination: '/admin.html' },
    { source: '/admin-next', destination: '/admin-dist/index.html' },
    { source: '/admin-next/:path*', destination: '/admin-dist/index.html' },
  ]);
  assert.deepEqual(
    fs.readdirSync(path.join(root, 'api'), { recursive: true })
      .filter((entry) => entry.endsWith('.js'))
      .map((entry) => entry.replaceAll('\\', '/')),
    ['router.js'],
  );
});

test('package exposes the read-only-by-default admin smoke runner', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['smoke:admin'], 'node scripts/admin-smoke.js');
});

test('build verification requires every referenced hashed CSS, JS, and font asset', (t) => {
  const { verifyBuildOutput } = require(path.join(root, 'scripts', 'build-admin.js'));
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-preview-build-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  fs.mkdirSync(path.join(fixture, 'admin-dist', 'assets'), { recursive: true });
  fs.mkdirSync(path.join(fixture, 'api'));
  for (const file of ['index.html', 'menu.html', 'qr-ordering.js']) fs.writeFileSync(path.join(fixture, file), 'preserved');
  fs.writeFileSync(path.join(fixture, 'api', 'router.js'), 'preserved');
  fs.writeFileSync(path.join(fixture, 'admin-dist', 'index.html'), [
    '<link rel="stylesheet" href="/admin-dist/assets/index-Ab12cd34.css">',
    '<link rel="preload" as="font" href="/admin-dist/assets/geist-Xy98kl76.woff2">',
    '<script type="module" src="/admin-dist/assets/index-Qr56st78.js"></script>',
  ].join(''));
  for (const asset of ['index-Ab12cd34.css', 'geist-Xy98kl76.woff2', 'index-Qr56st78.js']) {
    fs.writeFileSync(path.join(fixture, 'admin-dist', 'assets', asset), asset);
  }

  assert.doesNotThrow(() => verifyBuildOutput(fixture));
  fs.rmSync(path.join(fixture, 'admin-dist', 'assets', 'geist-Xy98kl76.woff2'));
  assert.throws(() => verifyBuildOutput(fixture), /referenced asset.*geist-Xy98kl76\.woff2/i);
  assert.equal(fs.readFileSync(path.join(fixture, 'index.html'), 'utf8'), 'preserved');
  assert.equal(fs.readFileSync(path.join(fixture, 'menu.html'), 'utf8'), 'preserved');
  assert.equal(fs.readFileSync(path.join(fixture, 'qr-ordering.js'), 'utf8'), 'preserved');
  assert.equal(fs.readFileSync(path.join(fixture, 'api', 'router.js'), 'utf8'), 'preserved');
});

test('buildAdmin execution preserves root public and API bytes', (t) => {
  const { buildAdmin } = require(path.join(root, 'scripts', 'build-admin.js'));
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-preview-execution-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  fs.mkdirSync(path.join(fixture, 'admin-app'));
  fs.mkdirSync(path.join(fixture, 'api'));
  const preserved = new Map([
    ['index.html', Buffer.from([0, 1, 2, 3])],
    ['menu.html', Buffer.from([4, 5, 6, 7])],
    ['qr-ordering.js', Buffer.from([8, 9, 10, 11])],
    [path.join('api', 'router.js'), Buffer.from([12, 13, 14, 15])],
  ]);
  for (const [relativePath, bytes] of preserved) fs.writeFileSync(path.join(fixture, relativePath), bytes);

  buildAdmin({
    rootDir: fixture,
    runVite: (rootDir) => {
      const assetsDir = path.join(rootDir, 'admin-dist', 'assets');
      fs.mkdirSync(assetsDir, { recursive: true });
      fs.writeFileSync(path.join(rootDir, 'admin-dist', 'index.html'), [
        '<link rel="stylesheet" href="/admin-dist/assets/index-Ab12cd34.css">',
        '<script src="/admin-dist/assets/index-Xy98kl76.js"></script>',
      ].join(''));
      fs.writeFileSync(path.join(assetsDir, 'index-Ab12cd34.css'), 'url(/admin-dist/assets/geist-Qr56st78.woff2)');
      fs.writeFileSync(path.join(assetsDir, 'index-Xy98kl76.js'), '');
      fs.writeFileSync(path.join(assetsDir, 'geist-Qr56st78.woff2'), '');
      return 0;
    },
  });

  for (const [relativePath, bytes] of preserved) {
    assert.deepEqual(fs.readFileSync(path.join(fixture, relativePath)), bytes, relativePath);
  }
});
