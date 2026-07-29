const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REQUIRED_ROOT_FILES = [
  'index.html',
  'menu.html',
  'qr-ordering.js',
  path.join('api', 'router.js'),
];

function requireFile(rootDir, relativePath) {
  const fullPath = path.join(rootDir, relativePath);
  if (!fs.statSync(fullPath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Admin build verification failed: missing ${relativePath.replaceAll('\\', '/')}`);
  }
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

function verifyBuildOutput(rootDir) {
  requireFile(rootDir, path.join('admin-dist', 'index.html'));
  for (const relativePath of REQUIRED_ROOT_FILES) {
    requireFile(rootDir, relativePath);
  }

  const assetsDir = path.join(rootDir, 'admin-dist', 'assets');
  if (!fs.statSync(assetsDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error('Admin build verification failed: missing admin-dist/assets');
  }
  const hasHashedAsset = listFiles(assetsDir).some((file) => /-[A-Za-z0-9_-]{6,}\.[^.]+$/.test(path.basename(file)));
  if (!hasHashedAsset) {
    throw new Error('Admin build verification failed: no hashed assets found in admin-dist/assets');
  }
}

function invokeVite(rootDir) {
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(
    command,
    ['vite', 'build', '--config', path.join('admin-app', 'vite.config.ts')],
    { cwd: rootDir, stdio: 'inherit' },
  );
  return typeof result.status === 'number' ? result.status : 1;
}

function buildAdmin(options = {}) {
  const rootDir = path.resolve(options.rootDir || path.join(__dirname, '..'));
  const adminApp = path.join(rootDir, 'admin-app');
  if (!fs.statSync(adminApp, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Admin build failed: admin-app directory is required at ${adminApp}`);
  }

  const status = (options.runVite || invokeVite)(rootDir);
  if (status !== 0) {
    throw new Error(`Admin build failed: Vite exited with code ${status}`);
  }
  verifyBuildOutput(rootDir);
}

if (require.main === module) {
  try {
    buildAdmin();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { buildAdmin, invokeVite, verifyBuildOutput };
