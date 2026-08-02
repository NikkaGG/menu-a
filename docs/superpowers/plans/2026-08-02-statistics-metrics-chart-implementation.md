# Statistics Metrics and Compact Chart Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if droids available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add synchronized order-count and average-check KPIs and replace the oversized statistics chart with an accessible, compact, smoothly collapsible chart.

**Architecture:** Extend the existing `/api/admin/stats` summary query so revenue, order count, and average check use the same Almaty range and request. Normalize the new fields through the existing typed client, then compose them into the current shadcn Card grid. Keep the chart mounted for animation, but use `aria-hidden` and `inert` while collapsed; explicitly override the shared chart aspect ratio with a 280px chart height.

**Tech Stack:** PostgreSQL, CommonJS Vercel API handlers, React 19, TypeScript, shadcn/ui, Tailwind CSS 4, Recharts, Vitest, React Testing Library, Playwright, Node test runner.

---

## File Map

- Modify `server/api/admin/stats.js`: count orders and calculate exact average check in the existing summary query.
- Modify `tests/admin-stats-postgres.test.js`: characterize summary SQL and aggregate output.
- Modify `tests/admin-stats-api.test.js`: verify HTTP response fields, zero handling, and unchanged range behavior.
- Modify `admin-app/src/lib/types.ts`: add normalized statistics fields.
- Modify `admin-app/src/lib/api.ts`: normalize camelCase and snake_case metric fields.
- Modify `admin-app/src/lib/api.test.ts`: verify metric normalization and decimal-string preservation.
- Modify `admin-app/src/lib/format.ts`: add reusable Russian integer formatting.
- Modify `admin-app/src/lib/format.test.ts`: verify integer grouping and invalid fallback.
- Modify `admin-app/src/features/stats/stats-page.tsx`: render KPI cards and the accessible chart disclosure.
- Modify `admin-app/src/features/stats/stats-chart.tsx`: enforce the compact chart height and override the shared aspect ratio.
- Modify `admin-app/src/features/stats/stats-page.test.tsx`: verify KPI, refresh, zero, disclosure, and accessibility behavior.
- Modify `admin-app/src/test/fixtures.ts`: return the expanded stats API contract in browser fixtures.
- Modify `admin-app/tests/admin-browser.spec.ts`: verify real geometry, motion, responsive wrapping, and disclosure controls.
- Modify `admin-app/tests/accessibility.spec.ts`: include expanded and collapsed chart states in axe coverage.

## Chunk 1: Same-query statistics contract

### Task 1: Add order count and average check to the statistics API

**Files:**
- Modify: `server/api/admin/stats.js`
- Test: `tests/admin-stats-postgres.test.js`
- Test: `tests/admin-stats-api.test.js`

- [ ] **Step 1: Write failing aggregate tests**

Adjust one in-range PGlite order total from `50.00` to `50.02` so the
integration test exercises third-decimal rounding (`250.02 / 4 = 62.505`).
Extend the existing expected aggregate result:

```js
assert.deepEqual(await aggregate(query, range), {
  totalRevenue: '250.02',
  totalProfit: '50.00',
  orderCount: 4,
  averageCheck: '62.51',
  points: expectedPoints,
  topDishes: expectedTopDishes,
});
```

Add a zero-order case:

```js
assert.deepEqual(await aggregate(query, range), {
  totalRevenue: '0.00',
  totalProfit: null,
  orderCount: 0,
  averageCheck: null,
  points: [],
  topDishes: [],
});
```

Assert `SUM(o.total)`, `COUNT(*)`, and average calculation share the same
`revenue_summary` CTE scan. The separate date-bounded `profit_summary` scan is
expected. Assert aggregate still executes exactly three queries and does not
add a fourth query.

Update both populated and empty exact `deepEqual` expectations in
`tests/admin-stats-api.test.js`. Its populated summary mock row must include:

```js
{ revenue: "123456789012345.60", profit: "15.00", order_count: 3, average_check: "41152263004115.20" }
```

Its empty summary mock row must include `order_count: 0` and
`average_check: null`.

- [ ] **Step 2: Run the server tests and confirm RED**

Run:

```powershell
node --test tests/admin-stats-postgres.test.js tests/admin-stats-api.test.js
```

Expected: failures because `orderCount` and `averageCheck` are absent.

- [ ] **Step 3: Extend the existing summary query**

Change the revenue summary CTE to select:

```sql
SELECT
  COALESCE(SUM(o.total), 0) AS revenue,
  COUNT(*)::integer AS order_count,
  CASE
    WHEN COUNT(*) = 0 THEN NULL
    ELSE (SUM(o.total) / COUNT(*))::text
  END AS average_check
FROM orders o
WHERE o.created_at >= $1::timestamptz
  AND o.created_at < $2::timestamptz
```

Return:

```js
orderCount: Number(summary.order_count || 0),
averageCheck: summary.average_check == null ? null : money(summary.average_check),
```

Keep the existing three-query `Promise.all`, profit semantics, points, and top
dishes unchanged.

- [ ] **Step 4: Verify server GREEN**

Run the focused command from Step 2.

Expected: all tests pass, including exact rounding and zero handling.

- [ ] **Step 5: Commit the server contract**

```powershell
git add server/api/admin/stats.js tests/admin-stats-postgres.test.js tests/admin-stats-api.test.js
git commit -m "feat: add order metrics to statistics API"
```

### Task 2: Normalize and format the new fields

**Files:**
- Modify: `admin-app/src/lib/types.ts`
- Modify: `admin-app/src/lib/api.ts`
- Test: `admin-app/src/lib/api.test.ts`
- Modify: `admin-app/src/lib/format.ts`
- Test: `admin-app/src/lib/format.test.ts`

- [ ] **Step 1: Write failing client and formatter tests**

Add snake_case fixture fields:

```ts
order_count: "1234",
average_check: "100.005",
```

Assert:

```ts
expect(stats).toMatchObject({
  orderCount: 1234,
  averageCheck: "100.005",
});
expect(formatInteger(1234)).toMatch(/1\s234/);
expect(formatInteger(Number.NaN)).toBe("0");
```

Also test camelCase input and `average_check: null`. Define malformed,
negative, and fractional order counts as invalid and normalize each to `0`.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```powershell
npm run test:unit -- admin-app/src/lib/api.test.ts admin-app/src/lib/format.test.ts
```

Expected: type/expectation failures for missing fields and formatter.

- [ ] **Step 3: Implement normalization and formatting**

Extend `Statistics`:

```ts
orderCount: number;
averageCheck: string | null;
```

Normalize through a bounded helper:

```ts
function nonNegativeInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

orderCount: nonNegativeInteger(raw.orderCount ?? raw.order_count),
averageCheck: nullableText(raw.averageCheck ?? raw.average_check),
```

Add one shared formatter:

```ts
const integer = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

export function formatInteger(value: number) {
  return integer.format(Number.isFinite(value) ? Math.trunc(value) : 0);
}
```

- [ ] **Step 4: Verify focused GREEN**

Run the command from Step 2.

Expected: all API and formatter tests pass.

- [ ] **Step 5: Commit the client contract**

```powershell
git add admin-app/src/lib/types.ts admin-app/src/lib/api.ts admin-app/src/lib/api.test.ts admin-app/src/lib/format.ts admin-app/src/lib/format.test.ts
git commit -m "feat: normalize statistics order metrics"
```

## Chunk 2: KPI cards and chart disclosure

### Task 3: Render responsive order KPIs

**Files:**
- Modify: `admin-app/src/features/stats/stats-page.tsx`
- Test: `admin-app/src/features/stats/stats-page.test.tsx`

- [ ] **Step 1: Write failing KPI tests**

Extend the statistics fixture with:

```ts
orderCount: 1234,
averageCheck: "100.005",
```

Assert the page renders:

```ts
expect(await screen.findByText("Количество заказов")).toBeInTheDocument();
expect(screen.getByText(/1\s?234/)).toBeInTheDocument();
expect(screen.getByText("Средний чек")).toBeInTheDocument();
expect(screen.getByText(/100,01\s?₸/)).toBeInTheDocument();
```

Add a response with `orderCount: 0`, `averageCheck: null`; assert `0` and `—`.
Change the selected preset and resolve a second response; assert all three
summary metrics update together.

- [ ] **Step 2: Run the component test and confirm RED**

Run:

```powershell
npm run test:unit -- admin-app/src/features/stats/stats-page.test.tsx
```

Expected: new KPI headings are absent.

- [ ] **Step 3: Compose the KPI grid**

Import `formatInteger`. Render cards in this order:

```tsx
<KpiCard title="Общая выручка" value={formatMoney(data.totalRevenue)} />
<KpiCard title="Количество заказов" value={formatInteger(data.orderCount)} />
<KpiCard title="Средний чек" value={data.averageCheck === null ? "—" : formatMoney(data.averageCheck)} />
{showProfit ? <KpiCard title="Общая прибыль" value={formatMoney(data.totalProfit ?? "0")} /> : null}
```

Use:

```tsx
className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
```

Do not change profit guidance or empty-state semantics.

- [ ] **Step 4: Verify KPI GREEN**

Run the command from Step 2.

Expected: KPI, refresh, zero, error, and concurrency tests pass.

- [ ] **Step 5: Commit KPI UI**

```powershell
git add admin-app/src/features/stats/stats-page.tsx admin-app/src/features/stats/stats-page.test.tsx
git commit -m "feat: show statistics order KPIs"
```

### Task 4: Make the chart compact and collapsible

**Files:**
- Modify: `admin-app/src/features/stats/stats-page.tsx`
- Modify: `admin-app/src/features/stats/stats-chart.tsx`
- Test: `admin-app/src/features/stats/stats-page.test.tsx`

- [ ] **Step 1: Write failing disclosure and sizing tests**

Assert:

```ts
const toggle = await screen.findByRole("button", { name: "Свернуть график" });
expect(toggle).toHaveAttribute("aria-expanded", "true");
expect(toggle).toHaveAttribute("aria-controls", "statistics-chart-region");
expect(screen.getByRole("img", { name: /График выручки/ })).toBeVisible();

await user.click(toggle);
expect(toggle).toHaveAccessibleName("Развернуть график");
expect(toggle).toHaveAttribute("aria-expanded", "false");
expect(screen.getByTestId("statistics-chart-region")).toHaveAttribute("aria-hidden", "true");
expect(screen.queryByRole("img", { name: /График выручки/ })).not.toBeInTheDocument();
```

Select `[data-slot="chart"]` and assert the actual chart container has
`h-[280px]`, `aspect-auto`, and `min-h-0`, with no effective `aspect-video` or
`min-h-64` contract.

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```powershell
npm run test:unit -- admin-app/src/features/stats/stats-page.test.tsx
```

Expected: toggle and compact sizing are absent.

- [ ] **Step 3: Implement the disclosure**

Add local `chartExpanded` state initialized to `true`. Import and use
`CardAction` so the disclosure occupies the existing shadcn Card header action
column. Compose it with the existing `Button` and lucide `ChevronUpIcon`;
rotate the icon through `cn()`.

Use an explicit 44px control:

```tsx
<CardAction>
  <Button
    type="button"
    variant="ghost"
    className="size-11"
    aria-expanded={chartExpanded}
    aria-controls="statistics-chart-region"
    aria-label={chartExpanded ? "Свернуть график" : "Развернуть график"}
  >
    <ChevronUpIcon />
  </Button>
</CardAction>
```

Add a component contract asserting `size-11` and browser geometry assertions
for at least 44×44 pixels.

The animated region uses:

```tsx
<div
  className={cn(
    "grid min-w-0 transition-[grid-template-rows,opacity] duration-300 ease-out",
    chartExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
  )}
>
  <div
    id="statistics-chart-region"
    data-testid="statistics-chart-region"
    aria-hidden={!chartExpanded}
    inert={chartExpanded ? undefined : true}
    className="min-h-0 overflow-hidden"
  >
    <CardContent className="min-w-0">
      <StatsChart ... />
    </CardContent>
  </div>
</div>
```

The button owns `aria-expanded`, `aria-controls`, and the changing Russian
accessible name.

- [ ] **Step 4: Bound the actual chart**

Change `StatsChart`'s `ChartContainer` class to:

```tsx
className="h-[280px] min-h-0 w-full aspect-auto"
```

This must override both `aspect-video` and `min-h-64` through the existing
`cn`/Tailwind merge path. Do not alter chart data, axes, tooltip, or lines.

- [ ] **Step 5: Verify focused GREEN and axe**

Run:

```powershell
npm run test:unit -- admin-app/src/features/stats/stats-page.test.tsx
```

Expected: disclosure, sizing, existing chart remount, error-boundary, and axe
tests pass.

- [ ] **Step 6: Commit the chart UI**

```powershell
git add admin-app/src/features/stats/stats-page.tsx admin-app/src/features/stats/stats-chart.tsx admin-app/src/features/stats/stats-page.test.tsx
git commit -m "feat: add compact statistics chart disclosure"
```

## Chunk 3: Browser contracts and release validation

### Task 5: Add responsive, animation, and accessibility coverage

**Files:**
- Modify: `admin-app/src/test/fixtures.ts`
- Modify: `admin-app/tests/admin-browser.spec.ts`
- Modify: `admin-app/tests/accessibility.spec.ts`

- [ ] **Step 1: Extend the browser API fixture**

Return:

```ts
order_count: 42,
average_check: "2939.447142857",
```

Keep points and top dishes unchanged.

- [ ] **Step 2: Write failing browser assertions**

In the statistics workflow:

- assert all KPI cards render and the KPI grid does not overflow;
- measure the expanded chart region at 250–320px high;
- across all five existing viewport projects, assert responsive geometry,
  compact expanded height, collapsed final height, no blank region, and 44×44
  toggle size;
- assert the table moves upward and there is no reserved blank region;
- assert the chart has `aria-hidden` and is absent from role queries;
- expand it again and verify focus/accessibility state;
- in one controlled animation test, call
  `page.emulateMedia({ reducedMotion: "no-preference" })` **before** loading
  `/stats`, assert computed `transition-property` contains grid rows and
  opacity, capture expanded height, click, wait two
  `requestAnimationFrame` callbacks, poll for a height strictly between
  expanded and near-zero, then wait for completion;
- in a separate reduced-motion test, call
  `page.emulateMedia({ reducedMotion: "reduce" })` before reload and assert the
  collapse settles without a prolonged transition.

Use the animated outer grid for height and computed-transition assertions.
Use `#statistics-chart-region` for `aria-hidden` and `inert`.

- [ ] **Step 3: Run the focused browser test and confirm RED**

Run responsive coverage across all configured projects:

```powershell
npm run test:browser -- --grep "statistics"
```

Expected: KPI/disclosure/height assertions fail.

Keep timing-sensitive intermediate-frame assertions in one explicitly selected
project:

```powershell
npm run test:browser -- --project=1440px --grep "statistics chart animation"
```

- [ ] **Step 4: Update axe coverage**

Exercise both expanded and collapsed states in
`admin-app/tests/accessibility.spec.ts`. Verify no violations in light and dark
themes and that the toggle remains at least 44×44.

- [ ] **Step 5: Run browser GREEN**

Run:

```powershell
npm run test:browser
```

Expected: all configured viewport projects pass, with only existing intentional
skips.

- [ ] **Step 6: Commit browser contracts**

```powershell
git add admin-app/src/test/fixtures.ts admin-app/tests/admin-browser.spec.ts admin-app/tests/accessibility.spec.ts
git commit -m "test: cover statistics metrics and chart disclosure"
```

### Task 6: Full validation and review

**Files:**
- Modify: none unless validation exposes a defect.

- [ ] **Step 1: Run the complete release gate**

```powershell
npm test
npm run build
npm run typecheck
npm run lint
npm run test:browser
& 'C:\Users\STARLINECOMP\Desktop\menu-qrcode\menu\bot\.venv\Scripts\python.exe' -m pytest bot\tests -q
& 'C:\Users\STARLINECOMP\Desktop\menu-qrcode\menu\bot\.venv\Scripts\python.exe' -m compileall -q bot
& 'C:\Users\STARLINECOMP\Desktop\menu-qrcode\menu\bot\.venv\Scripts\python.exe' -m pip check
```

Before running, verify the absolute bot interpreter exists. It is reused only
as the Python/dependency environment; pytest and compileall targets remain the
current statistics worktree.

Expected:

- no Node, unit, browser, Python, build, or type failures;
- lint has zero errors;
- only documented existing skips/warnings remain.

- [ ] **Step 2: Inspect repository safety**

```powershell
git status --short
git diff --check
git log --oneline main..HEAD
```

Verify no `.env`, credentials, screenshots, `admin-dist`, `.vercel`, or smoke
artifacts are staged.

- [ ] **Step 3: Dispatch final reviews**

Run spec compliance review, then code quality review, then feature review.
Resolve every Critical or Important finding and rerun affected validators.

- [ ] **Step 4: Preview and production verification**

Push only the feature branch first. Deploy through the configured Vercel
workflow and run authenticated read-only checks for:

- `/stats` metrics and chart disclosure at desktop and 320px;
- `/admin/menu`, `/admin/tables`, and existing table QR;
- `/admin.html`, `/`, `/t/:token`, `/order/:id`;
- independent `menu-a-eta.vercel.app`;
- bot `/health`.

Do not run mutation smoke against production. Record the current production
deployment as the rollback target before promotion.

Run the configured read-only smoke where deployment protection permits:

```powershell
$env:ADMIN_SMOKE_BASE_URL='https://menu-qrcode.vercel.app'
$env:ADMIN_SMOKE_LOGIN='<from ignored credentials>'
$env:ADMIN_SMOKE_PASSWORD='<from ignored credentials>'
$env:ADMIN_SMOKE_READONLY_TABLE_ID='<existing table id>'
npm run smoke:admin
```

Never set preview-mutation mode for the production origin. For an SSO-protected
preview, use the authenticated Vercel browser workflow instead of weakening
deployment protection.

- [ ] **Step 5: Integrate only after successful preview**

The owning main worktree is
`C:\Users\STARLINECOMP\Desktop\menu-qrcode\menu`. From there:

```powershell
git -C 'C:\Users\STARLINECOMP\Desktop\menu-qrcode\menu' merge --ff-only feat/statistics-metrics
```

Rerun focused merged-result tests in that main worktree before pushing. Monitor
the resulting production deployment and repeat read-only production smoke.
Roll back immediately if any canonical admin, API, QR, public, or legacy check
fails.
