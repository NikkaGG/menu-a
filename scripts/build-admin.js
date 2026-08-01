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

function referencedAssetNames(content) {
  return [...content.matchAll(/(?:\/admin-dist\/)?assets\/([^"'()\s]+)|url\((?:["']?)(?:\/admin-dist\/)?assets\/([^"'()\s]+)(?:["']?)\)/g)]
    .map((match) => match[1] || match[2]);
}

function verifyBuildOutput(rootDir) {
  const indexPath = path.join('admin-dist', 'index.html');
  requireFile(rootDir, indexPath);
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

  const pending = referencedAssetNames(fs.readFileSync(path.join(rootDir, indexPath), 'utf8'));
  const referenced = new Set();
  while (pending.length) {
    const assetName = pending.shift();
    if (referenced.has(assetName)) continue;
    referenced.add(assetName);
    const relativePath = path.join('admin-dist', 'assets', assetName);
    try {
      requireFile(rootDir, relativePath);
    } catch {
      throw new Error(`Admin build verification failed: missing referenced asset ${assetName}`);
    }
    if (path.extname(assetName) === '.css') {
      pending.push(...referencedAssetNames(fs.readFileSync(path.join(rootDir, relativePath), 'utf8')));
    }
  }

  if ([...referenced].some((asset) => path.extname(asset) === '.css')) {
    const requiredKinds = [
      ['CSS', /\.css$/],
      ['JavaScript', /\.js$/],
      ['font', /\.(?:woff2?|ttf|otf)$/],
    ];
    for (const [kind, pattern] of requiredKinds) {
      if (![...referenced].some((asset) => pattern.test(asset) && /-[A-Za-z0-9_-]{6,}\.[^.]+$/.test(asset))) {
        throw new Error(`Admin build verification failed: missing referenced hashed ${kind} asset`);
      }
    }
  }
}

function invokeVite(rootDir, runProcess = spawnSync) {
  const vitePath = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fs.statSync(vitePath, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Admin build failed: local Vite executable is required at ${vitePath}`);
  }
  const result = runProcess(
    process.execPath,
    [path.join('node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', path.join('admin-app', 'vite.config.ts')],
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
