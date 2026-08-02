const { getQuery } = require('../_lib/db');
const { requireAdmin } = require('../_lib/admin-auth');
const { json, methodNotAllowed } = require('../_lib/response');

const TIME_ZONE = 'Asia/Almaty';
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const GROUPS = new Set(['day', 'week', 'month']);
const dateTimeFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function parseDate(value) {
  if (typeof value !== 'string') return null;
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const epoch = Date.UTC(year, month - 1, day);
  const date = new Date(epoch);
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return { value, year, month, day, epoch };
}

function zonedMidnight(date) {
  const target = date.epoch;
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      dateTimeFormat.formatToParts(new Date(instant))
        .filter(({ type }) => type !== 'literal')
        .map(({ type, value }) => [type, Number(value)]),
    );
    const represented = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    instant += target - represented;
  }
  return new Date(instant).toISOString();
}

function parseRange(query = {}) {
  const from = parseDate(query.from);
  const to = parseDate(query.to);
  const groupBy = query.groupBy === undefined ? 'day' : query.groupBy;
  if (!from || !to || typeof groupBy !== 'string' || !GROUPS.has(groupBy)) return null;
  const inclusiveDays = ((to.epoch - from.epoch) / 86400000) + 1;
  if (inclusiveDays < 1 || inclusiveDays > 366) return null;
  const afterTo = new Date(to.epoch + 86400000);
  return {
    from: from.value,
    to: to.value,
    groupBy,
    fromUtc: zonedMidnight(from),
    toUtc: zonedMidnight({
      epoch: afterTo.getTime(),
      year: afterTo.getUTCFullYear(),
      month: afterTo.getUTCMonth() + 1,
      day: afterTo.getUTCDate(),
    }),
  };
}

function money(value) {
  if (typeof value === 'number') return value.toFixed(2);
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match) return '0.00';
  const fraction = (match[3] || '').padEnd(2, '0');
  let minor = (BigInt(match[2]) * 100n) + BigInt(fraction.slice(0, 2));
  if (fraction.length > 2 && Number(fraction[2]) >= 5) minor += 1n;
  const sign = match[1] && minor !== 0n ? '-' : '';
  const digits = minor.toString().padStart(3, '0');
  return `${sign}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

const SUMMARY_SQL = `
/* summary */
WITH revenue_summary AS (
  SELECT COALESCE(SUM(o.total), 0) AS revenue,
    COUNT(*)::integer AS order_count,
    CASE
      WHEN COUNT(*) = 0 THEN NULL
      ELSE (SUM(o.total) / COUNT(*))::text
    END AS average_check
  FROM orders o
  WHERE o.created_at >= $1::timestamptz
    AND o.created_at < $2::timestamptz
),
profit_summary AS (
  SELECT SUM((oi.dish_price - d.cost_price) * oi.quantity) AS profit
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  JOIN dishes d ON d.id = oi.dish_id
  WHERE o.created_at >= $1::timestamptz
    AND o.created_at < $2::timestamptz
    AND d.cost_price IS NOT NULL
)
SELECT revenue_summary.revenue::text AS revenue,
  revenue_summary.order_count,
  revenue_summary.average_check,
  profit_summary.profit::text AS profit
FROM revenue_summary
CROSS JOIN profit_summary`;

const POINTS_SQL = `
/* points */
WITH revenue_by_bucket AS (
  SELECT date_trunc($3, o.created_at AT TIME ZONE 'Asia/Almaty') AS bucket,
    SUM(o.total) AS revenue
  FROM orders o
  WHERE o.created_at >= $1::timestamptz
    AND o.created_at < $2::timestamptz
  GROUP BY bucket
),
profit_by_bucket AS (
  SELECT date_trunc($3, o.created_at AT TIME ZONE 'Asia/Almaty') AS bucket,
    SUM((oi.dish_price - d.cost_price) * oi.quantity) AS profit
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  JOIN dishes d ON d.id = oi.dish_id
  WHERE o.created_at >= $1::timestamptz
    AND o.created_at < $2::timestamptz
    AND d.cost_price IS NOT NULL
  GROUP BY bucket
)
SELECT to_char(revenue_by_bucket.bucket, 'YYYY-MM-DD') AS date,
  revenue_by_bucket.revenue::text AS revenue,
  profit_by_bucket.profit::text AS profit
FROM revenue_by_bucket
LEFT JOIN profit_by_bucket USING (bucket)
ORDER BY bucket`;

const TOP_DISHES_SQL = `
/* top dishes */
SELECT oi.dish_name, SUM(oi.quantity)::int AS quantity
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.created_at >= $1::timestamptz
  AND o.created_at < $2::timestamptz
GROUP BY oi.dish_name
ORDER BY quantity DESC, dish_name ASC
LIMIT 5`;

async function aggregate(query, range) {
  const bounds = [range.fromUtc, range.toUtc];
  const [summaryRows, pointRows, topRows] = await Promise.all([
    query(SUMMARY_SQL, bounds),
    query(POINTS_SQL, [...bounds, range.groupBy]),
    query(TOP_DISHES_SQL, bounds),
  ]);
  const summary = summaryRows[0] || {};
  return {
    totalRevenue: money(summary.revenue ?? 0),
    totalProfit: summary.profit == null ? null : money(summary.profit),
    orderCount: Number(summary.order_count ?? 0),
    averageCheck: summary.average_check == null ? null : money(summary.average_check),
    points: pointRows.map((row) => ({
      date: String(row.date).slice(0, 10),
      revenue: money(row.revenue),
      profit: row.profit == null ? null : money(row.profit),
    })),
    topDishes: topRows.map((row) => ({
      dish_name: row.dish_name,
      quantity: Number(row.quantity),
    })),
  };
}

function createAdminStatsHandler({ query = getQuery(), authorize } = {}) {
  return async (request, response) => {
    if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
    if (!await requireAdmin(request, response, authorize)) return;
    const range = parseRange(request.query);
    if (!range) return json(response, 400, { error: 'Invalid statistics range' });
    try {
      const statistics = await aggregate(query, range);
      return json(response, 200, {
        range: {
          from: range.from,
          to: range.to,
          groupBy: range.groupBy,
          timeZone: TIME_ZONE,
        },
        ...statistics,
      });
    } catch {
      return json(response, 500, { error: 'Unable to load statistics' });
    }
  };
}

async function handler(request, response) {
  return createAdminStatsHandler()(request, response);
}

module.exports = Object.assign(handler, {
  handler,
  createAdminStatsHandler,
  parseRange,
  aggregate,
});
