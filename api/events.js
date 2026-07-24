const { getQuery } = require('./_lib/db');
const { json, methodNotAllowed } = require('./_lib/response');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TYPES = new Set(['visit', 'product_view', 'add_to_cart', 'checkout_started', 'order_completed']);
const DEVICES = new Set(['mobile', 'tablet', 'desktop']);
const BROWSERS = new Set(['chrome', 'safari', 'firefox', 'edge', 'other']);
const DELIVERY = new Set(['delivery', 'pickup']);
const PAYMENT = new Set(['kaspi_invoice', 'card', 'cash']);
const LIMIT = 30;
const WINDOW_MS = 60 * 1000;
const MAX_BODY_BYTES = 32 * 1024;
const MAX_RATE_LIMIT_ENTRIES = 10000;
const attempts = new Map();

function invalid(message) {
  throw new Error(`Invalid event: ${message}`);
}

function exact(object, fields) {
  if (!object || typeof object !== 'object' || Array.isArray(object)
    || Object.keys(object).some((key) => !fields.includes(key))) invalid('unknown fields');
}

function stringField(value, max, label) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) invalid(label);
  return value;
}

function integerField(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) invalid(label);
  return value;
}

function product(value) {
  exact(value, ['id', 'name', 'category']);
  return {
    id: integerField(value.id, 1, 2147483647, 'product id'),
    name: stringField(value.name, 160, 'product name'),
    category: stringField(value.category, 80, 'category'),
  };
}

function validateEvent(input) {
  exact(input, ['eventType', 'visitorId', 'deviceClass', 'browserFamily', 'product',
    'quantityAdded', 'cartQuantity', 'deliveryMethod', 'paymentMethod', 'orderId', 'items', 'total']);
  if (!EVENT_TYPES.has(input.eventType) || !UUID.test(input.visitorId)) invalid('event type or visitor id');
  const output = { eventType: input.eventType, visitorId: input.visitorId };
  if (input.eventType === 'visit') {
    exact(input, ['eventType', 'visitorId', 'deviceClass', 'browserFamily']);
    if (!DEVICES.has(input.deviceClass) || !BROWSERS.has(input.browserFamily)) invalid('visit metadata');
    output.deviceClass = input.deviceClass;
    output.browserFamily = input.browserFamily;
  } else if (input.eventType === 'product_view') {
    exact(input, ['eventType', 'visitorId', 'product']);
    output.product = product(input.product);
  } else if (input.eventType === 'add_to_cart') {
    exact(input, ['eventType', 'visitorId', 'product', 'quantityAdded', 'cartQuantity']);
    output.product = product(input.product);
    output.quantityAdded = integerField(input.quantityAdded, 1, 99, 'quantity added');
    output.cartQuantity = integerField(input.cartQuantity, 1, 99, 'cart quantity');
  } else if (input.eventType === 'checkout_started') {
    exact(input, ['eventType', 'visitorId', 'deliveryMethod', 'paymentMethod']);
    if (!DELIVERY.has(input.deliveryMethod)) invalid('delivery method');
    if (input.paymentMethod !== undefined && !PAYMENT.has(input.paymentMethod)) invalid('payment method');
    output.deliveryMethod = input.deliveryMethod;
    if (input.paymentMethod !== undefined) output.paymentMethod = input.paymentMethod;
  } else {
    exact(input, ['eventType', 'visitorId', 'orderId', 'items', 'total', 'deliveryMethod', 'paymentMethod']);
    if (!UUID.test(input.orderId) || !DELIVERY.has(input.deliveryMethod) || !PAYMENT.has(input.paymentMethod)) invalid('order fields');
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) invalid('items');
    output.orderId = input.orderId;
    output.items = input.items.map((item) => {
      exact(item, ['id', 'name', 'category', 'quantity', 'unitPrice']);
      return {
        id: integerField(item.id, 1, 2147483647, 'product id'),
        name: stringField(item.name, 160, 'product name'),
        category: stringField(item.category, 80, 'category'),
        quantity: integerField(item.quantity, 1, 99, 'item quantity'),
        unitPrice: integerField(item.unitPrice, 1, 2147483647, 'unit price'),
      };
    });
    output.total = integerField(input.total, 1, 2147483647, 'total');
    if (output.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) !== output.total) invalid('total');
    output.deliveryMethod = input.deliveryMethod;
    output.paymentMethod = input.paymentMethod;
  }
  return output;
}

function clientIp(request) {
  return request.headers?.['x-vercel-forwarded-for']
    || request.headers?.['x-real-ip']
    || request.headers?.['x-forwarded-for']?.split(',')[0].trim()
    || 'unknown';
}

function allowed(ip, now, store = attempts, maxEntries = MAX_RATE_LIMIT_ENTRIES) {
  for (const [storedIp, timestamps] of store) {
    const recent = timestamps.filter((timestamp) => now - timestamp < WINDOW_MS);
    if (recent.length) store.set(storedIp, recent);
    else store.delete(storedIp);
  }
  const recent = store.get(ip) || [];
  if (recent.length >= LIMIT) {
    return false;
  }
  if (!store.has(ip) && store.size >= maxEntries) return false;
  recent.push(now);
  store.set(ip, recent);
  return true;
}

function bodySize(request) {
  const header = request.headers?.['content-length'];
  let declared;
  if (header !== undefined) {
    if (typeof header !== 'string' || !/^\d+$/.test(header.trim())) {
      return { error: 400 };
    }
    declared = Number(header);
    if (!Number.isSafeInteger(declared) || declared > MAX_BODY_BYTES) {
      return { error: 413 };
    }
  }
  const raw = Buffer.isBuffer(request.rawBody) || typeof request.rawBody === 'string'
    ? request.rawBody
    : request.body;
  const rawBytes = Buffer.isBuffer(raw)
    ? raw.length
    : typeof raw === 'string'
      ? Buffer.byteLength(raw)
      : null;
  if (rawBytes !== null && rawBytes > MAX_BODY_BYTES) return { error: 413 };
  if (declared === undefined && rawBytes === null) return { error: 411 };
  return { bytes: rawBytes === null ? declared : rawBytes };
}

function insertValues(event) {
  const base = [event.eventType, event.visitorId];
  if (event.eventType === 'visit') return [...base, null, null, null, null, null, event.deviceClass, event.browserFamily, null, null, null, null];
  if (event.eventType === 'product_view') return [...base, event.product.id, event.product.name, event.product.category, null, null, null, null, null, null, null, null];
  if (event.eventType === 'add_to_cart') return [...base, event.product.id, event.product.name, event.product.category, event.quantityAdded, event.cartQuantity, null, null, null, null, null, null];
  if (event.eventType === 'checkout_started') return [...base, null, null, null, null, null, null, null, event.deliveryMethod, event.paymentMethod || null, null, null];
  return [...base, null, null, null, null, null, null, null, event.deliveryMethod, event.paymentMethod, event.total, JSON.stringify({ orderId: event.orderId, items: event.items })];
}

function createEventsHandler({
  query = getQuery(),
  now = Date.now,
  rateLimitStore = attempts,
  maxRateLimitEntries = MAX_RATE_LIMIT_ENTRIES,
} = {}) {
  return async (request, response) => {
    if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
    const size = bodySize(request);
    if (size.error === 400) return json(response, 400, { error: 'Invalid Content-Length' });
    if (size.error === 411) return json(response, 411, { error: 'Content-Length required' });
    if (size.error === 413) {
      return json(response, 413, { error: 'Request too large' });
    }
    if (!allowed(clientIp(request), now(), rateLimitStore, maxRateLimitEntries)) {
      return json(response, 429, { error: 'Too many requests' }, { 'Retry-After': 60 });
    }
    try {
      const event = validateEvent(request.body);
      await query(
        `INSERT INTO analytics_events
          (event_type, visitor_id, product_id, product_name, category, quantity_added,
           cart_quantity, device_class, browser_family, delivery_method, payment_method,
           order_total, order_items, event_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
           CASE WHEN $1 = 'order_completed' THEN $14::uuid ELSE NULL END)
         ON CONFLICT (visitor_id, restaurant_date) WHERE event_type = 'visit' DO NOTHING`,
        [...insertValues(event), event.eventType === 'order_completed' ? event.orderId : null],
      );
      return json(response, 202, { ok: true });
    } catch (error) {
      if (error.code === '23505' && eventIsOrder(request.body)) return json(response, 202, { ok: true });
      if (error.message?.startsWith('Invalid event:')) return json(response, 400, { error: 'Invalid event' });
      return json(response, 500, { error: 'Unable to record event' });
    }
  };
}

function eventIsOrder(event) {
  return event && event.eventType === 'order_completed';
}

async function handler(request, response) {
  return createEventsHandler()(request, response);
}

module.exports = Object.assign(handler, {
  handler,
  validateEvent,
  createEventsHandler,
  clientIp,
  bodySize,
  allowed,
});
