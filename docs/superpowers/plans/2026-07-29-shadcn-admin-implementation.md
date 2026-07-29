# Shadcn Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if droids available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vanilla admin frontend with a tested React, TypeScript, Vite, and shadcn/ui application while preserving all existing admin behavior, public QR ordering, APIs, bot behavior, and the independent legacy site.

**Architecture:** Build an isolated `admin-app` into `admin-dist` from the repository root. Keep the existing one-function API router and legacy admin assets unchanged until preview parity and smoke checks pass, then make one controlled rewrite-only cutover. The React app uses an explicit route table, a typed same-origin API client, feature-local state machines, revision guards for concurrency, and shadcn primitives composed into Russian admin screens.

**Tech Stack:** React 19, TypeScript, Vite 7, Tailwind CSS 4, shadcn/ui `nova`, Radix UI, lucide-react, Recharts/shadcn Chart, Vitest, React Testing Library, axe, Playwright, Node `20.19.x`, npm.

---

## File Map

Create the following focused files:

- `admin-app/index.html`: React entry document, Russian language metadata, theme bootstrap, and root mount.
- `admin-app/src/main.tsx`: React root and global providers.
- `admin-app/src/App.tsx`: session gate, route selection, shell, and not-found route.
- `admin-app/src/styles/globals.css`: Tailwind import, semantic light/dark tokens, focus, reduced-motion, and responsive primitives.
- `admin-app/src/lib/api.ts`: typed request transport, response normalization, Russian error mapping, and shared auth transition.
- `admin-app/src/lib/types.ts`: normalized category, dish, table, and statistics types.
- `admin-app/src/lib/concurrency.ts`: load/mutation revisions, tombstones, and dialog-instance guards.
- `admin-app/src/lib/format.ts`: Almaty date presets, decimal money formatting, and Russian pluralization.
- `admin-app/src/lib/theme.ts`: `light | dark | system` persistence and pre-paint system resolution.
- `admin-app/src/lib/routes.ts`: explicit route table and page titles.
- `admin-app/src/components/ui/*`: generated official shadcn primitives only.
- `admin-app/src/components/admin-shell.tsx`: desktop sidebar, mobile sheet, header, theme control, logout, and focus management.
- `admin-app/src/components/session-gate.tsx`: loading, login, authenticated, and expired-session states.
- `admin-app/src/components/login-form.tsx`: accessible login fields, status-aware errors, and duplicate-submit prevention.
- `admin-app/src/features/menu/*`: category/dish state, forms, cards, dialogs, optimistic availability, and confirmations.
- `admin-app/src/features/tables/*`: table state, form, table, delete confirmation, and QR download.
- `admin-app/src/features/stats/*`: filters, KPIs, chart, accessible data table, and top dishes.
- `admin-app/src/test/*`: shared test providers, fixtures, mock API, and accessibility helpers.
- `admin-app/src/**/*.test.{ts,tsx}`: focused unit and component tests beside the tested modules.
- `admin-app/vite.config.ts`, `admin-app/vitest.config.ts`, `admin-app/playwright.config.ts`: build and test configuration.
- `admin-app/tsconfig.json`, `admin-app/components.json`, `admin-app/eslint.config.js`: project configuration and aliases.
- `admin-app/src/test/setup.ts`: jsdom matchers, cleanup, matchMedia, ResizeObserver, and axe test setup.

Modify only after tests or a migration checkpoint require it:

- `package.json`, `package-lock.json`, `.nvmrc`: pinned toolchain and exact root scripts.
- `.gitignore`: generated `admin-dist/` and local smoke artifacts.
- `scripts/run-node-tests.js`: explicit legacy CommonJS test enumeration.
- `scripts/build-admin.js`: isolated Vite build and output assertions.
- `vercel.json`: preview route, then atomic production rewrite cutover.
- `tests/*.test.js`: only characterization or final rewrite assertions, never backend behavior changes.

Preserve without functional edits:

- `api/router.js`, all API route modules, migrations, public `index.html`/`menu.html`, assets, `admin.html`, `admin.js`, and `admin.css`.
- The legacy admin remains a rollback implementation until the release is accepted.

## Chunk 1: Build Safety and Characterization Baseline

### Task 1: Add failing build and legacy-runner contract tests

**Files:**
- Create: `tests/admin-build.test.js`
- Create: `tests/legacy-test-runner.test.js`
- Test: existing `tests/vercel-router.test.js`

- [ ] **Step 1: Write failing tests** for the required root scripts, `engines.node: "20.19.x"`, exact `.nvmrc` value `20.19.0`, ignored `admin-dist`, explicit legacy test enumeration, Vite output location, preservation of `index.html`, and absence of API router changes.
- [ ] **Step 2: Run `node --test tests/admin-build.test.js tests/legacy-test-runner.test.js`** and confirm failure because the scripts and configuration do not exist.
- [ ] **Step 3: Implement the minimum toolchain contract** in `package.json`, `.nvmrc`, `.gitignore`, `scripts/run-node-tests.js`, and `scripts/build-admin.js`. The build script must invoke Vite with the admin config, never delete the repository root, and fail if `admin-dist/index.html`, hashed assets, public ordering files, or `api/router.js` are missing.
- [ ] **Step 4: Run the focused tests** and confirm they pass.
- [ ] **Step 5: Run the unchanged legacy suite with `npm run test:legacy`** and confirm `312` tests, `279` passed, `33` skipped, and `0` failed.
- [ ] **Step 6: Commit** with `git add package.json package-lock.json .nvmrc .gitignore scripts tests/admin-build.test.js tests/legacy-test-runner.test.js` and `git commit -m "build: add isolated admin build contracts"`.
- [ ] **Step 7: Create the project virtual environment** with `py -3.10 -m venv .venv`, install with `.\.venv\Scripts\python.exe -m pip install -r bot\requirements.txt`, and run `.\.venv\Scripts\python.exe -m pytest bot\tests -q`; expect `75 passed`.

### Task 2: Lock frontend dependencies and initialize shadcn

**Files:**
- Create: `admin-app/index.html`
- Create: `admin-app/components.json`
- Create: `admin-app/vite.config.ts`
- Create: `admin-app/vitest.config.ts`
- Create: `admin-app/tsconfig.json`
- Create: `admin-app/eslint.config.js`
- Create: `admin-app/src/App.tsx`
- Create: `admin-app/src/main.tsx`
- Create: `admin-app/src/main.test.tsx`
- Create: `admin-app/src/test/setup.ts`
- Create: `admin-app/src/styles/globals.css`
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Add a failing smoke test** asserting React mounts into `#root`, the configured `/admin-dist/` base is used, and a generated shadcn Button is available through the configured alias.
- [ ] **Step 2: Run `npm run test:unit -- admin-app/src/main.test.tsx`** and confirm the scaffold is missing.
- [ ] **Step 3: Keep one root `package.json` and root `package-lock.json`; do not create `admin-app/package.json`. Pin React 19, Vite 7, Tailwind 4, TypeScript, Vitest, Testing Library, Playwright, Radix, lucide-react, Recharts, and shadcn dependencies there. Initialize the official `@shadcn` `nova` configuration and add Button, Badge, Switch, Input, Textarea, Select, Card, Table, Dialog, AlertDialog, Field, Alert, Skeleton, Empty, Sonner, Chart, DropdownMenu, Sidebar, and Sheet through the shadcn CLI/registry, not handwritten replicas.**
- [ ] **Step 4: Implement `index.html`, `App.tsx`, Vite root/base/outDir, Vitest include-only `admin-app/**/*.{test,spec}.{ts,tsx}` with explicit legacy exclusion, ESLint, test setup, minimal React mount, and Tailwind semantic tokens.**
- [ ] **Step 5: Run the focused scaffold test and `npm run typecheck`; confirm both pass.**
- [ ] **Step 6: Run `npm run test:unit -- --reporter=verbose` and verify no `tests/*.test.js` file is collected.**
- [ ] **Step 7: Commit** only `admin-app/index.html`, `admin-app/components.json`, `admin-app/vite.config.ts`, `admin-app/vitest.config.ts`, `admin-app/tsconfig.json`, `admin-app/eslint.config.js`, `admin-app/src/App.tsx`, `admin-app/src/main.tsx`, `admin-app/src/main.test.tsx`, `admin-app/src/test/setup.ts`, `admin-app/src/styles/globals.css`, generated `admin-app/src/components/ui/*`, `package.json`, and `package-lock.json` with `git commit -m "feat: initialize shadcn admin app"`.

## Chunk 2: Core Contracts, Session, Theme, and Routing

### Task 3: Port API types and the Russian API client

**Files:**
- Create: `admin-app/src/lib/types.ts`
- Create: `admin-app/src/lib/api.ts`
- Create: `admin-app/src/lib/api.test.ts`
- Create: `admin-app/src/test/mock-api.ts`

- [ ] **Step 1: Write failing tests** for same-origin credentials, JSON and blob handling, snake_case request bodies, normalized responses, decimal-string preservation, `topDishes[].dish_name` mapping, all deterministic Russian errors, login `401`/`429`/other HTTP/network distinctions, and one quiet idempotent `401` auth transition.
- [ ] **Step 2: Run `npm run test:unit -- admin-app/src/lib/api.test.ts`** and verify the client behavior is absent.
- [ ] **Step 3: Implement explicit normalized types and the API transport. Never render unknown server messages, never log credentials, revoke QR object URLs, and expose an injectable auth-transition callback.**
- [ ] **Step 4: Run the focused API tests and confirm every contract passes.**
- [ ] **Step 5: Commit** with `git add admin-app/src/lib/types.ts admin-app/src/lib/api.ts admin-app/src/lib/api.test.ts admin-app/src/test/mock-api.ts` and `git commit -m "feat: add typed admin API client"`.

### Task 4: Add theme, routing, and session state

**Files:**
- Create: `admin-app/src/lib/theme.ts`
- Create: `admin-app/src/lib/theme.test.ts`
- Create: `admin-app/src/lib/routes.ts`
- Create: `admin-app/src/lib/routes.test.ts`
- Create: `admin-app/src/components/session-gate.tsx`
- Create: `admin-app/src/components/login-form.tsx`
- Create: `admin-app/src/components/session-gate.test.tsx`
- Create: `admin-app/src/components/admin-shell.tsx`
- Create: `admin-app/src/components/admin-shell.test.tsx`
- Modify: `admin-app/index.html`, `admin-app/src/main.tsx`, `admin-app/src/App.tsx`, `admin-app/src/styles/globals.css`

- [ ] **Step 1: Write failing tests** for invalid theme fallback, `admin-theme` persistence, system preference changes, pre-paint theme bootstrap, canonical routes, tested `/admin-next` preview-prefix normalization for all pages, unknown admin not-found state, titles, back/forward navigation, `aria-current`, heading focus, login focus, quiet expiry, and mobile sheet close/focus restoration.
- [ ] **Step 2: Run `npm run test:unit -- admin-app/src/lib/theme.test.ts admin-app/src/lib/routes.test.ts admin-app/src/components/session-gate.test.tsx admin-app/src/components/admin-shell.test.tsx`** and confirm failure.
- [ ] **Step 3: Implement theme and route utilities, preview-prefix normalization without changing canonical production links, session bootstrap, accessible login, shell navigation, official Sidebar/Sheet and DropdownMenu, logout, and route-change invalidation. Define navigation once in a shared Russian navigation array consumed by both Sidebar and Sheet.**
- [ ] **Step 4: Run focused tests plus axe checks and confirm both themes have visible focus, preview URLs render the intended page, and live regions do not announce the same error twice.**
- [ ] **Step 5: Commit** only the Task 4 files with `git commit -m "feat: add admin shell session and themes"`.

## Chunk 3: Menu Feature and Concurrency

### Task 5: Implement menu state and concurrency guards

**Files:**
- Create: `admin-app/src/lib/concurrency.ts`
- Create: `admin-app/src/lib/concurrency.test.ts`
- Create: `admin-app/src/features/menu/menu-state.ts`
- Create: `admin-app/src/features/menu/menu-state.test.ts`
- Create: `admin-app/src/lib/format.ts`
- Create: `admin-app/src/lib/format.test.ts`

- [ ] **Step 1: Write failing characterization tests** for all eight invariants wherever applicable to categories and dishes: stale availability responses, mutation versus reload, deletion tombstones, late edits, delete winning over edits/availability, dialog revisions, route/sign-out invalidation, and centralized auth transition.
- [ ] **Step 2: Run `npm run test:unit -- admin-app/src/lib/concurrency.test.ts admin-app/src/features/menu/menu-state.test.ts`** and verify failure.
- [ ] **Step 3: Implement per-resource load revisions, per-entity mutation revisions, tombstones, dialog-instance revisions, and the single auth guard. Treat abort controllers as optimization only. Keep catalog sorting numeric-first with stable name fallback and preserve URL/money/date formatting semantics.**
- [ ] **Step 4: Run the focused tests repeatedly, including delayed and rejected promises, and confirm no stale result wins.**
- [ ] **Step 5: Commit** exactly `admin-app/src/lib/concurrency.ts`, `admin-app/src/lib/concurrency.test.ts`, `admin-app/src/lib/format.ts`, `admin-app/src/lib/format.test.ts`, `admin-app/src/features/menu/menu-state.ts`, and `admin-app/src/features/menu/menu-state.test.ts` with `git commit -m "feat: preserve admin menu concurrency semantics"`.

### Task 6: Build menu pages and forms

**Files:**
- Create: `admin-app/src/features/menu/menu-page.tsx`
- Create: `admin-app/src/features/menu/category-section.tsx`
- Create: `admin-app/src/features/menu/dish-row.tsx`
- Create: `admin-app/src/features/menu/category-dialog.tsx`
- Create: `admin-app/src/features/menu/dish-dialog.tsx`
- Create: `admin-app/src/features/menu/menu-page.test.tsx`
- Modify: `admin-app/src/components/admin-shell.tsx`, `admin-app/src/styles/globals.css`

- [ ] **Step 1: Write failing component tests** for skeleton, empty/error/retry states, counts, category and dish ordering, create/edit/delete payloads, validation, duplicate-submit prevention, photo preview validation, availability rollback, localized toasts/errors, AlertDialog confirmations, and long Russian text wrapping.
- [ ] **Step 2: Run `npm run test:unit -- admin-app/src/features/menu/menu-page.test.tsx`** and confirm failure.
- [ ] **Step 3: Compose official Card, Table, Button, Badge, Switch, Input, Textarea, Select, Dialog, AlertDialog, Field, Skeleton, Empty, Alert, and Sonner primitives into the menu page. Ensure all labels, descriptions, errors, icon names, switch names, touch targets, and dialog focus behavior are accessible.**
- [ ] **Step 4: Run focused unit and axe tests at representative narrow and desktop DOM sizes.**
- [ ] **Step 5: Commit** exactly the Task 6 feature files plus `admin-app/src/components/admin-shell.tsx` and `admin-app/src/styles/globals.css` with `git commit -m "feat: implement shadcn menu management"`.

## Chunk 4: Tables and Statistics

### Task 7: Implement tables, deletion protections, and QR downloads

**Files:**
- Create: `admin-app/src/features/tables/tables-page.tsx`
- Create: `admin-app/src/features/tables/tables-state.ts`
- Create: `admin-app/src/features/tables/tables-state.test.ts`
- Create: `admin-app/src/features/tables/table-dialog.tsx`
- Create: `admin-app/src/features/tables/table-row.tsx`
- Create: `admin-app/src/features/tables/tables-page.test.tsx`

- [ ] **Step 1: Write failing state tests** for load/mutation revisions, create versus reload, deletion tombstones, repeated delete races, delete winning over intervening work, late table-dialog completion, route/sign-out invalidation, and centralized `401`.
- [ ] **Step 2: Write failing component tests** for table loading, count, empty/error/retry states, validation, duplicate-submit prevention, localized protected-delete errors, AlertDialog confirmation, QR blob filename extraction, object URL revocation, and bounded table scrolling.
- [ ] **Step 3: Run `npm run test:unit -- admin-app/src/features/tables/tables-state.test.ts admin-app/src/features/tables/tables-page.test.tsx`** and confirm failure.
- [ ] **Step 4: Implement the guarded table state and page with official Table, Card, Dialog, AlertDialog, Button, Badge, Skeleton, Empty, Alert, and Sonner components. Preserve table history behavior and avoid any production mutation in read-only smoke tooling.**
- [ ] **Step 5: Run the focused tests and confirm stale table work, QR cleanup, and session expiry behavior.**
- [ ] **Step 6: Commit** exactly the Task 7 files with `git commit -m "feat: implement table and QR management"`.

### Task 8: Implement statistics filters, chart, and accessible fallback

**Files:**
- Create: `admin-app/src/features/stats/stats-page.tsx`
- Create: `admin-app/src/features/stats/stats-filters.tsx`
- Create: `admin-app/src/features/stats/stats-chart.tsx`
- Create: `admin-app/src/features/stats/stats-table.tsx`
- Create: `admin-app/src/features/stats/stats-page.test.tsx`

- [ ] **Step 1: Write failing tests** for Almaty presets, inclusive dates, groupBy query serialization, decimal money formatting, null-profit behavior, KPI/table/chart parity, top-five ordering, empty/loading/error/retry states, stale range responses, chart render failure fallback, and the `/admin/menu` link from the unavailable-profit hint.
- [ ] **Step 2: Run `npm run test:unit -- admin-app/src/features/stats/stats-page.test.tsx`** and confirm failure.
- [ ] **Step 3: Compose official Chart, Card, Table, Button, Input, Select, Skeleton, Empty, Alert, and Sonner components. Keep the accessible table equivalent visible or available when the chart renders, omit the profit dataset when profit is null, and destroy chart resources on replacement/unmount.**
- [ ] **Step 4: Run focused unit and accessibility tests in both themes.**
- [ ] **Step 5: Commit** exactly the Task 8 files with `git commit -m "feat: implement statistics dashboard"`.

## Chunk 5: Browser Validation and Preview Rollout

### Task 9: Add browser and accessibility regression coverage

**Files:**
- Create: `admin-app/playwright.config.ts`
- Create: `admin-app/src/test/fixtures.ts`
- Create: `admin-app/tests/admin-browser.spec.ts`
- Create: `admin-app/tests/accessibility.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing browser tests** using a local Vite preview server with mocked long Russian and unbroken stress data at 320, 390, 768, 1024, and 1440 px. Cover session/login, menu, every form and confirmation, tables/QR, statistics, both themes, mobile sheet, keyboard navigation, focus restoration, and direct/back/forward routes.
- [ ] **Step 2: Run `npm run test:browser`** against the configured local preview and confirm the first missing workflow, accessibility, or geometry assertion fails rather than relying on an absent-server failure.
- [ ] **Step 3: Implement deterministic Playwright fixtures and assertions for `scrollWidth`, designated table scroll containers, bounding-box intersections, asset loading, minimum `44×44` touch targets, dialog focus trap/Escape/restoration for every dialog, label-description-error ARIA relationships, Russian names for icon-only and availability controls, duplicate live-region announcements, both-theme contrast, reduced-motion behavior, and chart table fallback.**
- [ ] **Step 4: Run `npm run test:browser` and separate PowerShell commands `npm run typecheck` and `npm run lint`; fix every diagnostic before proceeding.**
- [ ] **Step 5: Commit** exactly the Task 9 files with `git commit -m "test: add admin browser accessibility coverage"`.

### Task 10: Add preview-only routing and build smoke

**Files:**
- Create: `scripts/admin-smoke.js`
- Create: `tests/admin-smoke.test.js`
- Create: `tests/admin-preview-build.test.js`
- Modify: `vercel.json`, `scripts/build-admin.js`, `package.json`

- [ ] **Step 1: Write failing tests** for preview-only `/admin-next` and `/admin-next/:path*` rewrites, final admin asset reachability, public QR route preservation, one API function, and absence of root cleanup.
- [ ] **Step 2: Write failing `admin-smoke.js` tests** for cleanup in `finally`, partial setup cleanup, order `table → dish → category`, `404` as success, retries only for network errors and HTTP `408`, `425`, `429`, and `5xx`, exactly three retries with `250 ms`, `1 s`, and `2 s` backoff, failure on other statuses or retry exhaustion, and production mode performing no mutations.
- [ ] **Step 3: Run `npm run build`, `node --test tests/admin-preview-build.test.js tests/admin-smoke.test.js`; confirm the route/output and smoke-runner assertions fail.**
- [ ] **Step 4: Add temporary preview rewrites while `/admin`, `/admin/menu`, `/admin/tables`, and `/stats` remain legacy. Add `admin-smoke.js` with read-only production mode and preview mutation mode, required environment variables, dependency-safe finally cleanup, 404-as-success handling, and retries only for the specified transient failures.**
- [ ] **Step 5: Verify `.nvmrc`, `engines.node`, and the Vercel project Node runtime setting are all `20.19.0`/`20.19.x`; update the Vercel project setting before preview deployment if it differs.**
- [ ] **Step 6: Run `npm run build`, the focused preview/smoke tests, and inspect `admin-dist` plus the root public files.**
- [ ] **Step 7: Deploy a preview using the repository's configured Vercel workflow. Run read-only browser smoke against `/admin-next`, `/admin-next/menu`, `/admin-next/tables`, and `/admin-next/stats`; run mutation smoke only against preview data.**
- [ ] **Step 8: Commit** exactly `scripts/admin-smoke.js`, `tests/admin-smoke.test.js`, `tests/admin-preview-build.test.js`, `vercel.json`, `scripts/build-admin.js`, and `package.json` with `git commit -m "test: validate shadcn admin preview deployment"`.

## Chunk 6: Cutover, Verification, and Rollback Readiness

### Task 11: Switch production rewrites atomically

**Files:**
- Modify: `vercel.json`
- Modify: `tests/admin-page.test.js`
- Modify: `tests/admin-preview-build.test.js`

- [ ] **Step 1: Write failing cutover assertions** requiring `/api/:path*` to remain first, all four public admin URLs and `/admin/:path*` to target `/admin-dist/index.html`, `/admin-next` to be removed, and direct `/admin.html` to remain available.
- [ ] **Step 2: Run the focused rewrite tests and confirm they fail against the preview configuration.**
- [ ] **Step 3: Complete a parity checklist showing every legacy behavior assertion has an equivalent React unit or browser test. Only the legacy rewrite/file-shape assertion may change; do not delete or weaken backend, API, or concurrency assertions.**
- [ ] **Step 4: Replace only the admin/statistics rewrite destinations atomically. Do not edit `api/router.js`, public ordering rewrites, legacy assets, or the independent legacy-domain configuration.**
- [ ] **Step 5: Run the focused tests, `npm run build`, `npm run test:legacy`, `npm run test:unit`, `npm run typecheck`, `npm run lint`, and `.\.venv\Scripts\python.exe -m pytest bot\tests -q`.**
- [ ] **Step 6: Commit** exactly `vercel.json`, `tests/admin-page.test.js`, and `tests/admin-preview-build.test.js` with `git commit -m "feat: cut over admin routes to React app"`.

### Task 12: Production smoke, review, and final validation

**Files:**
- Modify: none unless validation exposes a defect.
- Test: `scripts/admin-smoke.js`, `admin-app/tests/*.spec.ts`, all root suites.

- [ ] **Step 1: Capture the currently promoted production deployment ID in the implementation handoff and session todo before any promotion; this is the exact rollback target.**
- [ ] **Step 2: Deploy the cutover commit to the intended Vercel preview and verify build output, asset requests, API rewrites, public QR ordering, and direct `/admin.html`.**
- [ ] **Step 3: Run read-only preview smoke with `ADMIN_SMOKE_BASE_URL`, `ADMIN_SMOKE_LOGIN`, `ADMIN_SMOKE_PASSWORD`, and an existing `ADMIN_SMOKE_READONLY_TABLE_ID`. Verify authentication, all four canonical routes, statistics, and QR response without mutations.**
- [ ] **Step 4: Run browser geometry and accessibility checks against the preview at every required viewport and both themes.**
- [ ] **Step 5: Run the full pre-promotion validation gate: `npm test`, `npm run build`, `npm run typecheck`, `npm run lint`, `npm run test:browser`, `.\.venv\Scripts\python.exe -m pytest bot\tests -q`, `.\.venv\Scripts\python.exe -m compileall -q bot`, and `.\.venv\Scripts\python.exe -m pip check`.**
- [ ] **Step 6: Promote the validated deployment, then rerun read-only smoke against actual production `/admin`, `/admin/menu`, `/admin/tables`, `/stats`, a public QR ordering route, direct `/admin.html`, and the independent legacy domain.**
- [ ] **Step 7: If any specified login/session, asset, API, public-route, menu, table, QR, statistics, or legacy-domain check fails, immediately promote the recorded rollback deployment ID and verify recovery before making further changes.**
- [ ] **Step 8: Inspect `git diff`, `git diff --cached`, and `git status`; verify no credentials, environment files, generated secrets, screenshots, smoke output, or build outputs are staged.**
- [ ] **Step 9: Dispatch spec compliance review, then code quality review, then feature review. Fix findings and rerun the affected validators.**
- [ ] **Step 10: Keep `admin.html`, `admin.js`, and `admin.css` available for one release and include the rollback deployment ID in the final implementation handoff.**
- [ ] **Step 11: Commit any final test-only or cutover corrections with exact file staging and a focused message. Do not push until the final staged diff has been reviewed for secrets and the user explicitly requests publication.**

## Execution Rules

- Use `@superpowers:subagent-driven-development` with a fresh implementer for each task and two-stage review after each implementation task.
- Follow `@superpowers:test-driven-development`: every behavior change starts with a failing focused test, then the smallest implementation, then the focused test and milestone validators.
- Keep exactly one in-progress task in the session todo list.
- Do not modify the API router, database, bot, public ordering UI, or legacy domain.
- Do not run production mutation smoke. Preview mutation smoke must always clean up in a `finally` block.
- Do not stage the pre-existing root audit screenshots.
- Do not claim completion until fresh validation passes and the production and legacy URLs have been checked.
