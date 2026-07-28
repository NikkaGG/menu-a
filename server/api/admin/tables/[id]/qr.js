const { getQuery } = require('../../../_lib/db');
const { requireAdmin } = require('../../../_lib/admin-auth');
const { isUuid } = require('../../../_lib/public-api');
const { json, methodNotAllowed } = require('../../../_lib/response');
const {
  normalizeAppUrl,
  safeTableFilename,
} = require('../../../_lib/admin-tables');

function defaultEncodeQr(payload, options) {
  return require('qrcode').toBuffer(payload, options);
}

function createTableQrHandler({
  query = getQuery(),
  authorize,
  env = process.env,
  encodeQr = defaultEncodeQr,
} = {}) {
  return async (request, response) => {
    if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
    if (!await requireAdmin(request, response, authorize)) return;

    const id = request.query?.id;
    if (!isUuid(id)) return json(response, 400, { error: 'Invalid table id' });
    const appUrl = normalizeAppUrl(env);
    if (!appUrl) return json(response, 500, { error: 'Unable to generate QR code' });

    try {
      const rows = await query(
        'SELECT id, number, token FROM restaurant_tables WHERE id = $1',
        [id],
      );
      if (!rows.length) return json(response, 404, { error: 'Table not found' });
      const table = rows[0];
      const payload = `${appUrl}/t/${table.token}`;
      const png = await encodeQr(payload, {
        type: 'png',
        errorCorrectionLevel: 'H',
        margin: 4,
        width: 512,
      });
      response.setHeader('Content-Type', 'image/png');
      response.setHeader('Content-Disposition', `attachment; filename="${safeTableFilename(table.number)}"`);
      response.setHeader('Cache-Control', 'private, no-store');
      if (typeof response.status === 'function') response.status(200);
      return response.end(png);
    } catch {
      return json(response, 500, { error: 'Unable to generate QR code' });
    }
  };
}

async function handler(request, response) {
  return createTableQrHandler()(request, response);
}

module.exports = Object.assign(handler, { handler, createTableQrHandler });
