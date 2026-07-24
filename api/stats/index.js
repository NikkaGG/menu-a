const { getQuery } = require('../_lib/db');
const { readSessionCookie, verifySessionToken } = require('../_lib/auth');
const { json, methodNotAllowed } = require('../_lib/response');

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function parseDays(value) {
  if (value === undefined) return 30;
  if (typeof value !== 'string' || !['7', '30', '90'].includes(value)) {
    throw new Error('Invalid days parameter');
  }
  return Number(value);
}

function restaurantDate(now) {
  return new Date(now + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addDays(date, amount) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function number(value) {
  return Number(value || 0);
}

async function aggregate(query, from, to, days) {
  const params = [from, to];
  const [kpiRows, visitRows, viewedRows, orderedRows, hourRows, weekdayRows,
    deliveryRows, paymentRows, abandonedRows] = await Promise.all([
    query(`SELECT
      count(*) FILTER (WHERE event_type = 'visit')::int AS visits,
      count(DISTINCT visitor_id) FILTER (WHERE event_type = 'visit')::int AS unique_visitors,
      count(*) FILTER (WHERE event_type = 'order_completed')::int AS orders,
      count(DISTINCT event_key) FILTER (WHERE event_type = 'order_completed')::int AS unique_orders,
      coalesce(sum(order_total) FILTER (WHERE event_type = 'order_completed'), 0)::bigint AS revenue
      FROM analytics_events WHERE restaurant_date BETWEEN $1::date AND $2::date`, params),
    query(`SELECT restaurant_date::text AS date, count(*)::int AS visits,
      count(DISTINCT visitor_id)::int AS unique_visitors
      FROM analytics_events WHERE event_type = 'visit' AND restaurant_date BETWEEN $1::date AND $2::date
      GROUP BY restaurant_date ORDER BY restaurant_date`, params),
    query(`SELECT product_id AS id, max(product_name) AS name, max(category) AS category, count(*)::int AS views
      FROM analytics_events WHERE event_type = 'product_view' AND restaurant_date BETWEEN $1::date AND $2::date
      GROUP BY product_id ORDER BY views DESC, product_id LIMIT 10`, params),
    query(`SELECT (item->>'id')::int AS id, max(item->>'name') AS name, max(item->>'category') AS category,
      sum((item->>'quantity')::int)::int AS quantity, count(DISTINCT event_key)::int AS orders
      FROM analytics_events CROSS JOIN LATERAL jsonb_array_elements(order_items->'items') item
      WHERE event_type = 'order_completed' AND restaurant_date BETWEEN $1::date AND $2::date
      GROUP BY (item->>'id')::int ORDER BY quantity DESC, id LIMIT 10`, params),
    query(`SELECT extract(hour FROM occurred_at AT TIME ZONE 'UTC' + interval '5 hours')::int AS hour,
      count(*)::int AS orders FROM analytics_events
      WHERE event_type = 'order_completed' AND restaurant_date BETWEEN $1::date AND $2::date
      GROUP BY hour ORDER BY hour`, params),
    query(`SELECT extract(isodow FROM occurred_at AT TIME ZONE 'UTC' + interval '5 hours')::int AS weekday,
      count(*)::int AS orders FROM analytics_events
      WHERE event_type = 'order_completed' AND restaurant_date BETWEEN $1::date AND $2::date
      GROUP BY weekday ORDER BY weekday`, params),
    query(`SELECT delivery_method AS method, count(*)::int AS orders FROM analytics_events
      WHERE event_type = 'order_completed' AND restaurant_date BETWEEN $1::date AND $2::date
      GROUP BY delivery_method ORDER BY delivery_method`, params),
    query(`SELECT payment_method AS method, count(*)::int AS orders FROM analytics_events
      WHERE event_type = 'order_completed' AND restaurant_date BETWEEN $1::date AND $2::date
      GROUP BY payment_method ORDER BY payment_method`, params),
    query(`WITH last_add AS (
        SELECT visitor_id, product_id, max(product_name) AS name, max(category) AS category,
          max(occurred_at) AS last_at, sum(quantity_added)::int AS quantity
        FROM analytics_events
        WHERE event_type = 'add_to_cart' AND restaurant_date BETWEEN $1::date AND $2::date
        GROUP BY visitor_id, product_id
      )
      SELECT product_id AS id, max(name) AS name, max(category) AS category,
        sum(quantity)::int AS quantity, count(DISTINCT visitor_id)::int AS visitors
      FROM last_add a WHERE a.last_at <= now() - interval '24 hours' AND NOT EXISTS (
        SELECT 1 FROM analytics_events completed
        WHERE completed.event_type = 'order_completed' AND completed.visitor_id = a.visitor_id
          AND completed.occurred_at > a.last_at AND completed.occurred_at < a.last_at + interval '24 hours'
          AND EXISTS (SELECT 1 FROM jsonb_array_elements(completed.order_items->'items') item
            WHERE (item->>'id')::int = a.product_id)
      ) GROUP BY product_id ORDER BY quantity DESC, product_id LIMIT 10`, params),
  ]);

  const rawKpis = kpiRows[0] || {};
  const visits = number(rawKpis.visits);
  const uniqueVisitors = number(rawKpis.unique_visitors);
  const orders = number(rawKpis.unique_orders || rawKpis.orders);
  const revenue = number(rawKpis.revenue);
  const byDate = new Map(visitRows.map((row) => [String(row.date).slice(0, 10), row]));
  const visitsByDay = Array.from({ length: days }, (_, index) => {
    const date = addDays(from, index);
    const row = byDate.get(date) || {};
    return { date, visits: number(row.visits), uniqueVisitors: number(row.unique_visitors) };
  });
  const byHour = new Map(hourRows.map((row) => [number(row.hour), number(row.orders)]));
  const byWeekday = new Map(weekdayRows.map((row) => [number(row.weekday), number(row.orders)]));
  const byDelivery = new Map(deliveryRows.map((row) => [row.method, number(row.orders)]));
  const byPayment = new Map(paymentRows.map((row) => [row.method, number(row.orders)]));
  const share = (count) => orders ? Math.round((count / orders) * 1000) / 10 : 0;
  const products = (rows, countFields) => rows.map((row) => ({
    id: number(row.id),
    name: row.name,
    category: row.category,
    ...Object.fromEntries(countFields.map((field) => [field, number(row[field])])),
  }));

  return {
    kpis: {
      visits,
      uniqueVisitors,
      orders,
      conversionRate: visits
        ? Math.min(100, Math.round((orders / visits) * 1000) / 10)
        : 0,
      averageCheck: orders ? Math.round(revenue / orders) : 0,
    },
    visitsByDay,
    topViewedProducts: products(viewedRows, ['views']),
    topOrderedProducts: products(orderedRows, ['quantity', 'orders']),
    ordersByHour: Array.from({ length: 24 }, (_, hour) => ({ hour, orders: byHour.get(hour) || 0 })),
    ordersByWeekday: Array.from({ length: 7 }, (_, index) => ({
      weekday: index + 1,
      label: WEEKDAYS[index],
      orders: byWeekday.get(index + 1) || 0,
    })),
    deliveryMethods: ['delivery', 'pickup'].map((method) => {
      const methodOrders = byDelivery.get(method) || 0;
      return { method, orders: methodOrders, share: share(methodOrders) };
    }),
    paymentMethods: ['card', 'cash', 'kaspi_invoice'].map((method) => {
      const methodOrders = byPayment.get(method) || 0;
      return { method, orders: methodOrders, share: share(methodOrders) };
    }),
    abandonedProducts: products(abandonedRows, ['quantity', 'visitors']),
  };
}

function createStatsHandler({ query = getQuery(), env = process.env, now = Date.now } = {}) {
  if (!env.STATS_SESSION_SECRET) throw new Error('STATS_SESSION_SECRET is required');
  return async (request, response) => {
    if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
    const token = readSessionCookie(request.headers?.cookie);
    if (!verifySessionToken(token, env.STATS_SESSION_SECRET, now())) {
      return json(response, 401, { error: 'Authentication required' });
    }
    let days;
    try {
      days = parseDays(request.query?.days);
    } catch {
      return json(response, 400, { error: 'Invalid days parameter' });
    }
    const to = restaurantDate(now());
    const from = addDays(to, -(days - 1));
    try {
      const data = await aggregate(query, from, to, days);
      return json(response, 200, { range: { days, from, to }, ...data });
    } catch {
      return json(response, 500, { error: 'Unable to load statistics' });
    }
  };
}

async function handler(request, response) {
  return createStatsHandler()(request, response);
}

module.exports = Object.assign(handler, { handler, parseDays, createStatsHandler, aggregate });
