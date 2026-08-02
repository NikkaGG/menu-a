# Mobile Tables and QR Cards Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if droids available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present every table as a compact, immediately actionable card below 768px while preserving the existing semantic table and desktop layout.

**Architecture:** Keep one semantic `<table>` and one set of row actions. Use Tailwind responsive display/layout utilities to present the same `<thead>`, `<tbody>`, `<tr>`, and `<td>` elements as mobile cards at the base breakpoint and restore native table display at `md`; all API and async behavior stays unchanged.

**Tech Stack:** React 19, TypeScript, shadcn/ui Table/Button/AlertDialog, Tailwind CSS 4, Vitest, React Testing Library, Playwright, axe.

---

## File Map

- Modify `admin-app/src/features/tables/tables-page.tsx`: responsive table/container/header/body classes and semantic table label.
- Modify `admin-app/src/features/tables/table-row.tsx`: mobile card grid, labels, compact action row, and stable selectors.
- Modify `admin-app/src/features/tables/tables-page.test.tsx`: class, semantics, action-count, error, and axe contracts.
- Modify `admin-app/src/test/fixtures.ts`: controlled QR/delete failure responses for browser geometry tests.
- Modify `admin-app/tests/admin-browser.spec.ts`: replace mobile sideways-scroll assertions with card geometry and error-state checks.
- Modify `admin-app/tests/accessibility.spec.ts`: explicit light/dark mobile-card axe and semantics checks.

## Chunk 1: Responsive component contract

### Task 1: Transform table rows into phone cards

**Files:**
- Modify: `admin-app/src/features/tables/tables-page.tsx`
- Modify: `admin-app/src/features/tables/table-row.tsx`
- Test: `admin-app/src/features/tables/tables-page.test.tsx`
- Test: `admin-app/tests/admin-browser.spec.ts`

- [ ] **Step 1: Write failing responsive unit and browser contracts**

Extend the populated-page test to locate the real shadcn slots and assert the
wished-for base and `md` contracts:

```tsx
const table = container.querySelector('[data-slot="table"]');
const header = container.querySelector('[data-slot="table-header"]');
const body = container.querySelector('[data-slot="table-body"]');
const row = container.querySelector("[data-table-card-row]");

expect(table).toHaveAttribute("aria-label", "Столы и QR-коды");
expect(table?.className).toContain("min-w-0");
expect(table?.className).toContain("md:min-w-[720px]");
expect(header?.className).toContain("sr-only");
expect(header?.className).toContain("md:not-sr-only");
expect(body?.className).toContain("grid");
expect(body?.className).toContain("md:table-row-group");
expect(row?.className).toContain("grid");
expect(row?.className).toContain("md:table-row");
```

Assert one row has exactly one download button and one delete button, visible
mobile labels “Стол” and “Создан”, and stable value/action selectors. Assert the
container uses base `overflow-x-visible border-0` and restores
`md:overflow-x-auto md:border`.

In the same RED edit, add every semantic/edge assertion:

- one semantic table, one header row, one body row, three column headers, and
  exactly three body cells for the one-table fixture;
- the three column headers have stable IDs
  `tables-number-heading`/`tables-created-heading`/`tables-actions-heading`,
  and each body cell's `headers` attribute points to its matching header;
- visible phone labels remain visible but have `aria-hidden="true"`, no body
  cell has `aria-labelledby`, and the number/date values remain intact;
- exactly one QR/delete action per row;
- a 100-character name and long QR error remain contained with
  `whitespace-normal` and `[overflow-wrap:anywhere]`;
- controls carry `min-h-11 min-w-11`;
- existing delete dialog/QR delegation and axe assertions remain green.

In the existing Playwright “table form” workflow, replace the phone assertion
that requires sideways scrolling. For 320px and 390px, assert zero list
overflow, card separation, one visible QR/delete action per row, 44×44 button
geometry, no value/action overlap, contained long names, and preserved semantic
table/row/cell/header roles. Assert `[data-table-created]` has computed
`text-align: right` below 768px. At 768px and wider, require visually restored
headers, native table-row layout, the bounded number column, and computed
`text-align: left` for `[data-table-created]`.

For the screen-reader-only phone header, assert exact computed values rather
than Playwright visibility:

```ts
expect(styles.position).toBe("absolute");
expect(styles.width).toBe("1px");
expect(styles.height).toBe("1px");
expect(styles.overflow).toBe("hidden");
expect(styles.whiteSpace).toBe("nowrap");
expect(styles.clip).toBe("rect(0px, 0px, 0px, 0px)");
```

At `md`, assert `position: static`, `display: table-header-group`,
`overflow: visible`, `white-space: normal`, and a rendered width/height greater
than one pixel.

- [ ] **Step 2: Run the component test and confirm RED**

Run:

```powershell
npm run test:unit -- admin-app/src/features/tables/tables-page.test.tsx
npm run test:browser -- --grep "table form"
```

Expected: unit contracts fail because responsive classes/selectors/labels are
absent; phone browser projects fail because the table still overflows and
actions require sideways scrolling.

- [ ] **Step 3: Implement the responsive table shell**

In `TablesPage`, keep the existing `Table` component and state mapping, but use:

```tsx
<Table
  aria-label="Столы и QR-коды"
  className="min-w-0 md:table md:min-w-[720px]"
  containerProps={{
    "aria-label": "Таблица столов",
    "data-table-scroll": "true",
    "data-table-scroll-region": "true",
    tabIndex: 0,
    className: "min-w-0 max-w-full overflow-x-visible rounded-none border-0 md:overflow-x-auto md:rounded-lg md:border",
  }}
>
  <TableHeader className="sr-only md:not-sr-only">
    ...
  </TableHeader>
  <TableBody className="grid gap-3 md:table-row-group">
    ...
  </TableBody>
</Table>
```

Do not create a second mobile list or duplicate controls. Keep the desktop
minimum width only at `md`. Give the three `TableHead` elements stable IDs:
`tables-number-heading`, `tables-created-heading`, and
`tables-actions-heading`.

- [ ] **Step 4: Implement one responsive row**

Apply one mobile grid to the native `tr`:

```tsx
<UiTableRow
  data-table-card-row="true"
  className="grid grid-cols-[minmax(0,1fr)_auto] rounded-lg border bg-card md:table-row md:rounded-none md:border-x-0 md:border-t-0 md:bg-transparent"
>
```

The number cell explicitly overrides shadcn's default nowrap behavior:

```tsx
className="block min-w-0 whitespace-normal p-3 [overflow-wrap:anywhere] md:table-cell md:max-w-64 md:p-2"
```

The date cell keeps its timestamp on one line and restores desktop alignment:

```tsx
className="block min-w-0 whitespace-nowrap p-3 text-right md:table-cell md:p-2 md:text-left"
```

Each contains a `md:hidden` label with muted small text:

```tsx
<span aria-hidden="true" className="block text-xs text-muted-foreground md:hidden">Стол</span>
```

and:

```tsx
<span aria-hidden="true" className="block text-xs text-muted-foreground md:hidden">Создан</span>
```

Set each cell's `headers` attribute to the matching stable column-header ID:
`tables-number-heading`, `tables-created-heading`, or
`tables-actions-heading`. Keep the visible phone label spans
`aria-hidden="true"` to avoid duplicate announcements from the native table
association, and do not add `aria-labelledby`. Give the values stable
`data-table-number` and `data-table-created` selectors.

The action cell spans both mobile columns:

```tsx
<TableCell
  data-table-actions
  className="col-span-2 block min-w-0 border-t p-2 md:table-cell md:border-t-0"
>
  <div className="grid min-w-0 grid-cols-2 gap-2 md:flex md:min-w-max md:flex-row md:items-start">
```

Both buttons use `min-h-11 min-w-11 w-full md:w-auto`. Keep their existing
full `aria-label`s. Use one button with responsive text only:

```tsx
<span className="md:hidden">Скачать QR</span>
<span className="hidden md:inline">Скачать QR-код</span>
```

Do not change handlers, pending flags, error placement, dialog behavior, or
icons. QR errors remain below the action grid inside the same cell. Delete
errors remain inside the existing alert dialog.

- [ ] **Step 5: Verify component GREEN**

Run:

```powershell
npm run test:unit -- admin-app/src/features/tables/tables-page.test.tsx
npm run test:browser -- --grep "table form"
npm run typecheck
```

Expected: all table-page tests, the basic five-viewport table workflow, and
typecheck pass.

- [ ] **Step 6: Commit the responsive component**

```powershell
git add admin-app/src/features/tables/tables-page.tsx admin-app/src/features/tables/table-row.tsx admin-app/src/features/tables/tables-page.test.tsx admin-app/tests/admin-browser.spec.ts
git commit -m "feat: add compact mobile table cards" -m "Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>"
```

## Chunk 2: Real browser geometry and accessibility

### Task 2: Replace mobile scroll coverage with card contracts

**Files:**
- Modify: `admin-app/src/test/fixtures.ts`
- Modify: `admin-app/tests/admin-browser.spec.ts`
- Modify: `admin-app/tests/accessibility.spec.ts`

- [ ] **Step 1: Write failing pending and error-state browser tests**

In a dedicated test that runs only in the 390px project, write the wished-for
`createRouteGate()` usage and `ApiState` controls described below. The test
must require deterministic disabled states, localized errors, and contained
long stress text before those fixture controls exist.

In the same RED edit, extend the existing light/dark `/admin/tables` axe pass
to require one semantic table, exactly one QR/delete action per fixture row,
44×44 phone action geometry, and zero violations before and after opening the
delete dialog. These checks must exist before fixture or production changes.

- [ ] **Step 2: Run the error-state test and confirm RED**

Run:

```powershell
npm run test:browser -- --project=390px --grep "table card pending and error geometry"
```

Expected: FAIL because `createRouteGate` and the QR/delete gate controls are not
yet implemented.

- [ ] **Step 3: Add deterministic fixture gates and errors**

Export a test-only gate helper from `fixtures.ts`:

```ts
export type RouteGate = {
  entered: Promise<void>;
  wait: () => Promise<void>;
  release: () => void;
};

export function createRouteGate(): RouteGate {
  let markEntered!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => { markEntered = resolve; });
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  return {
    entered,
    wait: async () => { markEntered(); await blocked; },
    release,
  };
}
```

Extend `ApiState` with:

```ts
tableQrError: string | null;
tableDeleteError: string | null;
tableQrGate: RouteGate | null;
tableDeleteGate: RouteGate | null;
```

Initialize them to `null`. The QR/delete route first awaits its gate when one
exists, then returns the configured error with HTTP 409. Use only existing
recognized server keys:

```ts
"Unable to generate QR code"
"Table has session history and cannot be deleted"
```

This preserves production error sanitization and exercises the actual localized
client messages.

- [ ] **Step 4: Add phone error and pending geometry**

In a dedicated 390px test:

1. create `tableQrGate`, set the recognized QR error, and start the download;
2. await `tableQrGate.entered`, assert the QR button is disabled and the action
   grid remains inside the card, then call `release()`;
3. wait for the localized card alert; for the geometry-only stress case,
   replace that rendered alert’s `textContent` in the browser with a long safe
   Russian sentence, then assert it wraps inside the card without overlap or
   page overflow;
4. create `tableDeleteGate`, set the recognized delete error, open the dialog,
   and confirm deletion;
5. await `tableDeleteGate.entered`, assert the confirmation is disabled, then
   release it;
6. wait for the localized delete alert; expand only its rendered text for the
   geometry stress assertion and verify it remains contained inside the
   existing dialog without viewport overflow.

The DOM text expansion is deliberately test-only: it stress-tests CSS
containment without weakening `localizedError()` or adding a production-only
message. Do not use arbitrary sleeps.

- [ ] **Step 5: Verify browser GREEN**

Run:

```powershell
npm run test:browser -- --grep "table|admin pages have no axe"
npm run test:browser
```

Expected: all five viewport projects pass with only intentional existing skips.

The browser contract intentionally targets Chromium, matching the repository's
existing Playwright project matrix and deployed support baseline.

- [ ] **Step 6: Commit browser contracts**

```powershell
git add admin-app/src/test/fixtures.ts admin-app/tests/admin-browser.spec.ts admin-app/tests/accessibility.spec.ts
git commit -m "test: cover mobile table card geometry" -m "Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>"
```

## Chunk 3: Validation and safe release

### Task 3: Run the release gate and deploy safely

**Files:**
- Modify: none unless validation exposes a tested defect.

- [ ] **Step 1: Run the complete local gate**

```powershell
npm test
npm run build
npm run typecheck
npm run lint
npm run test:browser
& 'C:\Program Files\Python310\python.exe' -m pytest bot\tests -q
& 'C:\Program Files\Python310\python.exe' -m compileall -q bot
& 'C:\Users\STARLINECOMP\Desktop\menu-qrcode\menu\bot\.venv\Scripts\python.exe' -m pip check
```

Expected:

- all Node, unit, browser, Python, build, and type checks pass;
- lint has zero errors;
- only the documented generated shadcn Fast Refresh and bundle-size warnings
  remain;
- the deployment-relevant bot virtual environment has no broken requirements.

- [ ] **Step 2: Verify repository safety**

```powershell
git status --short
git diff --check
git log --oneline main..HEAD
```

Do not stage `.env`, `.vercel`, generated reports, screenshots, downloaded QR
files, or the user's three audit images in the owning main worktree.

- [ ] **Step 3: Run final reviews**

Dispatch final spec compliance, code-quality, and full feature release reviews.
Fix every Critical or Important issue through a failing test and rerun all
affected checks.

- [ ] **Step 4: Validate a protected preview**

Push only `feat/mobile-table-cards`, deploy a Vercel preview, and run
authenticated read-only checks:

- `/admin/tables` at 320, 390, 768, and 1440px;
- real table cards have visible QR/delete actions without phone overflow;
- download one existing table QR and verify its PNG signature;
- open but do not confirm a delete dialog against real data;
- `/admin`, `/admin/menu`, `/stats`, `/admin.html`, `/`, and one existing
  `/t/:token` route remain healthy;
- `menu-a-eta.vercel.app` still serves Sushi Crazy;
- local bot `/health` returns JSON with `status: "ok"`.

If Vercel CLI creates a temporary automation protection bypass, revoke every
bypass secret and verify the count returns to zero. Do not run mutation smoke
against production.

- [ ] **Step 5: Integrate only after preview passes**

Record the current production deployment ID as rollback. In the owning main
worktree:

```powershell
git -C 'C:\Users\STARLINECOMP\Desktop\menu-qrcode\menu' merge --ff-only feat/mobile-table-cards
```

Run exact merged-result checks:

```powershell
npm run test:unit -- admin-app/src/features/tables/tables-page.test.tsx
npm run test:browser -- --grep "table"
npm run build
npm run typecheck
```

Push `main`, wait for the production deployment to become READY, and repeat the
read-only mobile geometry/QR/public/legacy/bot smoke. If any canonical admin
route, table semantics, QR download, phone overflow, public route, legacy site,
or bot check fails, immediately promote the recorded rollback deployment,
verify the production alias and recovery smoke, and stop the rollout. Preserve
the vanilla admin rollback files and the user's untracked screenshots.
