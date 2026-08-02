# Statistics Metrics and Compact Chart Design

## Goal

Improve the existing Russian statistics page without changing its date,
grouping, authentication, concurrency, or request lifecycle:

- add order count and average check summary metrics;
- keep both metrics synchronized with the existing revenue selection;
- make the chart compact and locally collapsible;
- preserve responsive, accessible, light/dark, and reduced-motion behavior.

## Existing boundaries

- The React page is `admin-app/src/features/stats/stats-page.tsx`.
- Chart rendering is isolated in `stats-chart.tsx`.
- `/api/admin/stats` is implemented by `server/api/admin/stats.js`.
- The endpoint currently obtains summary, grouped points, and top dishes in
  one request with the same inclusive Almaty date range.
- Money is transported as decimal strings and formatted by `formatMoney`.
- Existing request cancellation and latest-result-wins guards remain intact.

## Data contract

Extend the existing summary SQL, rather than introducing another endpoint or
frontend request.

The summary query will count the same `orders` rows used by total revenue:

- `orderCount`: a non-negative integer;
- `averageCheck`: a two-decimal decimal string when `orderCount > 0`, otherwise
  `null`.

Average check is calculated in PostgreSQL from the same summary rows and
normalized with the existing server-side money helper. This avoids JavaScript
floating-point loss and guarantees that revenue, order count, and average check
share identical date bounds.

The API client accepts camelCase and snake_case response keys and normalizes
them into the `Statistics` model without changing existing fields.

## Summary layout

Summary metrics remain directly below the filters and above profit guidance,
chart, table, and top dishes.

Cards:

1. Общая выручка
2. Количество заказов
3. Средний чек
4. Общая прибыль, only when profit is available

The grid uses one column on phones, two columns from the small breakpoint, and
up to four columns on wide screens. This keeps all high-level metrics together
while allowing the existing profit-unavailable alert to retain its meaning.

Order count uses Russian integer grouping. Average check uses `formatMoney`.
For an empty period, order count displays `0` and average check displays `—`.

## Compact collapsible chart

The chart starts expanded on each page mount and is not persisted.

The chart card header contains a shadcn `Button` with a lucide chevron:

- the accessible name is `Свернуть график` or `Развернуть график`;
- `aria-expanded` reflects state;
- `aria-controls` points to the chart region;
- the touch target remains at least 44 by 44 pixels.

The expanded chart is 280 pixels high and never uses viewport height. The
statistics chart explicitly overrides the shared `ChartContainer`
`aspect-video` behavior and its current minimum height; the actual Recharts
container receives the bounded height, rather than being clipped by an outer
wrapper.

Collapse is animated with a CSS grid row transition plus opacity so the table
and popular dishes rise without an empty gap. During the collapsed state the
chart region is also `hidden` from the accessibility tree and cannot receive
focus. It becomes accessible again when expanded. Existing global
`prefers-reduced-motion` rules reduce the transition to effectively immediate.

The chart component keeps its data, axes, tooltip, exact raw decimal tooltip
values, error boundary, and accessible table fallback unchanged.

## Empty, loading, and error behavior

- Existing skeleton, retry, validation, abort, and stale-response behavior is
  unchanged.
- A successful response with zero orders renders `0` and `—`.
- Existing empty-state logic remains based on absent grouped points and top
  dishes.
- Unknown backend errors remain localized and never expose server details.

## Testing

Follow TDD.

Server/API tests:

- summary SQL counts the same order rows as revenue;
- zero orders yield `orderCount: 0` and `averageCheck: null`;
- nonzero orders yield an exact two-decimal average;
- API response shape and snake/camel normalization are preserved.

React tests:

- all metrics render and refresh with each submitted range/grouping;
- integer and money formatting are reused;
- zero handling shows `0` and `—`;
- chart starts expanded and toggles with correct accessible state;
- chart content leaves layout and the accessibility tree when collapsed.

Browser tests:

- expanded chart height remains within the compact target range;
- collapse has no reserved blank area;
- normal-motion mode exposes the intended grid-row/height and opacity
  transitions without an intermediate layout jump;
- no page-level overflow at 320, 390, 768, 1024, and 1440 pixels;
- metric cards wrap correctly;
- keyboard, axe, touch-target, dark/light, and reduced-motion contracts pass.

## Scope exclusions

- No additional endpoint or orders fetch.
- No changes to date presets, grouping rules, or Almaty boundaries.
- No persistence of chart disclosure state.
- No changes to public ordering, tables, menu management, bot behavior, or
  legacy domain.
