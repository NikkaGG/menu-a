const { exactObject } = require('./public-api');

const MAX_TABLE_NUMBER_LENGTH = 100;

function validTableBody(body) {
  return exactObject(body, ['number'])
    && Object.keys(body).length === 1
    && typeof body.number === 'string'
    && body.number.trim().length > 0
    && body.number.trim().length <= MAX_TABLE_NUMBER_LENGTH;
}

function mapTable(row) {
  return {
    id: row.id,
    number: row.number,
    token: row.token,
    createdAt: row.created_at,
    qrUrl: `/api/admin/tables/${row.id}/qr`,
  };
}

function isUniqueViolation(error, field) {
  if (error?.code !== '23505') return false;
  const databaseContext = `${error.constraint || ''} ${error.detail || ''}`.toLowerCase();
  return databaseContext.includes(field);
}

function normalizeAppUrl(env) {
  const configured = env?.APP_URL;
  if (typeof configured !== 'string' || !configured.trim()) return null;
  try {
    const url = new URL(configured.trim());
    const httpAllowed = env?.NODE_ENV !== 'production';
    if (url.protocol !== 'https:' && !(httpAllowed && url.protocol === 'http:')) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

function safeTableFilename(number) {
  const safeNumber = String(number).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'table';
  return `table-${safeNumber}.png`;
}

module.exports = {
  mapTable,
  normalizeAppUrl,
  safeTableFilename,
  isUniqueViolation,
  validTableBody,
};
