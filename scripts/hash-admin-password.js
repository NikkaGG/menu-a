const { hashPassword } = require('../api/_lib/admin-password');

async function readPassword() {
  if (process.argv.length !== 2) {
    throw new Error('Usage: pipe a password to node scripts/hash-admin-password.js');
  }
  process.stdin.setEncoding('utf8');
  let password = '';
  for await (const chunk of process.stdin) {
    password += chunk;
    if (password.length > 1026) throw new Error('Password is too long');
  }
  return password.replace(/\r?\n$/, '');
}

async function main() {
  process.stdout.write(`${await hashPassword(await readPassword())}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
