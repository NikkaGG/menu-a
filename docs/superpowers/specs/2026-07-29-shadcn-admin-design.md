# Shadcn Admin Panel Design

## Goal

Replace the current vanilla admin interface with a polished React and shadcn/ui application while preserving the working QR menu, API routes, authentication, database, Telegram bot, and legacy site.

## Scope

The migration covers:

- `/admin`
- `/admin/menu`
- `/admin/tables`
- `/stats`

It preserves all existing admin capabilities:

- login and logout;
- category creation, editing, ordering, and deletion;
- dish creation, editing, deletion, availability, pricing, cost pricing, photos, categories, and ordering;
- table creation, deletion, and QR download;
- revenue, profit, chart, date filters, grouping, and top dishes.

The public QR ordering interface and all backend contracts remain unchanged.

## Architecture

Create an isolated `admin-app` built with:

- React;
- TypeScript;
- Vite;
- Tailwind CSS;
- shadcn/ui from the official `@shadcn` registry.

The application is a client-side admin shell. Vite produces the admin assets consumed by the existing Vercel rewrites. The project build must continue to publish the current public ordering files and the new admin bundle together. The existing single-function API dispatcher remains unchanged so the Vercel Hobby function limit is not affected.

The old `admin.html`, `admin.js`, and `admin.css` remain available during development. They are retired only after the React implementation reaches functional parity and passes production smoke tests.

## Application Boundaries

### Admin shell

Owns routing, session bootstrap, theme selection, responsive navigation, and the shared page frame.

### API client

Provides typed methods for the existing `/api/admin/*` endpoints. It:

- sends same-origin cookies;
- serializes existing request bodies without changing backend contracts;
- maps known backend errors to Russian messages;
- converts `401` responses into one centralized signed-out transition;
- exposes normalized category, dish, table, and statistics types.

No additional data-fetching library is required. Page hooks use React state, effects, request revision guards, and abort controllers to preserve the current stale-response protections.

### Feature modules

- `auth`: login, logout, session states;
- `menu`: categories, dishes, dialogs, availability, and deletion;
- `tables`: table list, creation, deletion, and QR download;
- `stats`: filters, KPIs, chart, data table, and top dishes;
- `theme`: light/dark/system-aware theme persistence.

Each module owns its UI state and calls the shared API client.

## Visual System

The selected direction is black-and-white minimalism.

- Light theme uses white surfaces, near-black text, neutral grey backgrounds, clear black outlines, and restrained shadows.
- Dark theme uses near-black surfaces, white text, neutral borders, and no saturated decorative colors.
- Green is retained only where status semantics benefit from it, such as an enabled availability switch.
- Destructive actions use the semantic destructive variant.
- Borders remain visible in both themes and meet contrast expectations.

Theme selection is available in the header and persisted locally. The initial render honors the saved choice, otherwise the operating-system preference.

## Shadcn Components

Use official components before custom markup:

- `Sidebar` for desktop navigation;
- `Sheet` for mobile navigation;
- `Button`, `Badge`, `Switch`, `Input`, `Textarea`, and `Select`;
- `Card` for KPIs and grouped content;
- `Table` for desktop table management and statistics data;
- `Dialog` for category, dish, and table forms;
- `AlertDialog` for destructive confirmations;
- `Field`, `FieldGroup`, and related field primitives for forms;
- `Alert` for persistent errors;
- `Skeleton` for loading states;
- `Empty` for empty states;
- `Sonner` for transient feedback;
- `Chart` for revenue and profit;
- `DropdownMenu` for the theme control when appropriate.

All forms have labels, validation states, keyboard support, and accessible dialog titles. Icons come from the icon library selected by the generated shadcn configuration.

## Responsive Behavior

The interface must remain usable from 320 px upward.

- Desktop uses a fixed sidebar and content workspace.
- Tablet layouts stack dish actions before they can collide with availability controls.
- Mobile uses a navigation sheet and one-column content.
- Long Russian category, dish, status, button, error, and table text wraps without overlapping adjacent controls.
- Dish actions move below dish content on narrow screens.
- Dialog actions stack and become full width on narrow screens.
- Statistics filters and KPI cards become one column.
- Data tables use a bounded horizontal scroll region when a card representation would hide important columns.

No page-level horizontal scrolling is allowed.

## Interaction and Error States

Every page supports:

- initial skeleton loading;
- empty content;
- successful mutation feedback;
- localized inline or toast errors;
- retryable load failures;
- session expiry without duplicate error noise.

Submit controls are disabled while pending. Destructive operations require `AlertDialog` confirmation. Availability mutations roll back visually after failure. Stale load or mutation responses cannot overwrite newer state.

## Compatibility and Migration

The migration must not alter:

- API route paths or JSON contracts;
- authentication cookie behavior;
- public menu routes;
- QR links;
- database schema;
- Telegram bot behavior;
- the independent legacy domain.

Vercel rewrites continue to expose the same public URLs. Build output is verified before switching the admin rewrites to the new entry point.

## Testing

Follow test-driven development.

Automated coverage includes:

- API client error translation and `401` handling;
- routing and session bootstrap;
- forms and request payloads;
- duplicate-submit prevention;
- stale-response and rollback behavior;
- theme persistence;
- responsive navigation;
- accessibility of dialogs, fields, and controls;
- existing backend and integration suites.

Browser validation uses long Russian stress content at 320, 390, 768, 1024, and 1440 px. It checks page overflow, bounding-box intersections, both themes, mobile sheets, every dialog, table scrolling, charts, keyboard navigation, and all critical admin workflows.

## Build and Deployment Contract

Use npm because the repository has `package-lock.json`. Pin Node `20.19.0` for local and Vercel builds, enforce it in `.nvmrc`, `package.json` `engines.node` (`20.19.x`), and the Vercel project Node runtime setting.

The admin source lives under `admin-app/`. Vite uses:

- `root: admin-app`;
- `base: /admin-dist/`;
- `outDir: ../admin-dist`;
- `emptyOutDir: true`, limited to `admin-dist`;
- an entry file at `admin-app/index.html`.

The root project remains the Vercel static root. The build command is `npm run build`, which builds only `admin-app` into `admin-dist` and never cleans or copies over the repository root. Existing `index.html`, `menu.html`, `fonts/`, `icons/`, photos, API files, and legacy admin files remain available.

During cutover, only these rewrite destinations change:

- `/admin` -> `/admin-dist/index.html`;
- `/admin/menu` -> `/admin-dist/index.html`;
- `/admin/tables` -> `/admin-dist/index.html`;
- `/admin/:path*` -> `/admin-dist/index.html`;
- `/stats` -> `/admin-dist/index.html`.

The `/api/:path*` rewrite remains first. `api/router.js` remains the only Vercel function. Build verification must assert that the public menu, `admin-dist/index.html`, hashed admin assets, and API router are all present and reachable. A preview deployment spike must pass these assertions before production rewrites change.

## API Compatibility Matrix

The typed client preserves the current response/request boundary:

| Area | Endpoint contract | Client requirement |
| --- | --- | --- |
| Session | `GET /api/admin/session`, login/logout endpoints | Same-origin cookies, quiet idempotent `401` transition |
| Categories | `/api/admin/categories` and `/:id` | camelCase responses, snake_case mutation bodies, numeric `sort_order` |
| Dishes | `/api/admin/dishes` and `/:id` | decimal-string money responses, snake_case bodies, normalized photo URLs |
| Availability | `PATCH /api/admin/dishes/:id` with `{ is_available: boolean }` | optimistic update with rollback and entity revision |
| Tables | `/api/admin/tables` and `/:id` | preserve table history protections and Russian errors |
| QR | `GET /api/admin/tables/:id/qr` | binary blob, `Content-Disposition` filename, object URL revocation, shared `401` handling |
| Statistics | `GET /api/admin/stats?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=day|week|month` | preserve inclusive range limits, Asia/Almaty semantics, decimal strings, chart/table parity |

The client never displays unknown server details directly. It keeps money as decimal strings until locale formatting, preserves current photo URL validation, and keeps the current numeric sort order instead of adding drag-and-drop.

The normalized internal types are explicit:

- `Category`: `{ id, name, sortOrder }`;
- `Dish`: `{ id, categoryId, name, description: string | null, price: string, costPrice: string | null, photoUrl: string | null, isAvailable, sortOrder }`;
- `Table`: `{ id, number, createdAt }`;
- `Statistics`: `{ range: { from, to, groupBy, timeZone }, totalRevenue: string, totalProfit: string | null, points: Array<{ date, revenue: string, profit: string | null }>, topDishes: Array<{ dishName: string, quantity: number }> }`.

The client maps the current statistics `topDishes[].dish_name` response field to internal `dishName`, while all other response fields retain their current normalized names. Request bodies preserve the current snake_case fields exactly.

Known backend errors map to Russian messages for unauthorized access, sign-in failure, invalid/not-found/in-use categories, dish and table validation, duplicate tables, protected table deletion, loading failures, QR generation, and invalid statistics ranges. The fallback is always `Не удалось выполнить действие. Попробуйте ещё раз.`; raw database or server details are never rendered.

The deterministic error map is:

| Backend error | Russian UI message |
| --- | --- |
| `Unauthorized` | `Сессия истекла. Войдите снова.` |
| `Unable to sign in` | `Не удалось войти. Проверьте логин и пароль.` |
| `Method not allowed` | `Это действие недоступно.` |
| `Invalid category` | `Проверьте данные категории.` |
| `Invalid category id` | `Категория не найдена.` |
| `Category not found` | `Категория не найдена.` |
| `Category is in use` | `Категория используется и не может быть удалена.` |
| `Unable to create category` | `Не удалось создать категорию.` |
| `Unable to update category` | `Не удалось обновить категорию.` |
| `Unable to delete category` | `Не удалось удалить категорию.` |
| `Unable to load categories` | `Не удалось загрузить категории.` |
| `Invalid dish` | `Проверьте данные блюда.` |
| `Invalid dish id` | `Блюдо не найдено.` |
| `Dish not found` | `Блюдо не найдено.` |
| `Unable to create dish` | `Не удалось создать блюдо.` |
| `Unable to update dish` | `Не удалось обновить блюдо.` |
| `Unable to delete dish` | `Не удалось удалить блюдо.` |
| `Unable to load dishes` | `Не удалось загрузить блюда.` |
| `Invalid table` | `Проверьте номер или название стола.` |
| `Invalid table id` | `Стол не найден.` |
| `Table not found` | `Стол не найден.` |
| `Table number already exists` | `Стол с таким номером уже существует.` |
| `Table already exists` | `Такой стол уже существует.` |
| `Table has an open session` | `У стола есть активная сессия.` |
| `Table has session history and cannot be deleted` | `Стол с историей заказов удалить нельзя.` |
| `Unable to create table` | `Не удалось создать стол.` |
| `Unable to delete table` | `Не удалось удалить стол.` |
| `Unable to load tables` | `Не удалось загрузить столы.` |
| `Unable to allocate a unique table token` | `Не удалось создать стол.` |
| `Unable to generate QR code` | `Не удалось создать QR-код.` |
| `Invalid statistics range` | `Проверьте выбранный период.` |
| `Unable to load statistics` | `Не удалось загрузить статистику.` |

Login handling is status-aware: `401` uses the credentials message, `429` uses `Слишком много попыток. Попробуйте позже.`, other HTTP failures use `Не удалось выполнить вход. Попробуйте позже.`, and network failures use `Не удалось выполнить вход. Проверьте подключение к интернету.`.

## Concurrency Invariants

The React implementation must preserve these existing behaviors before the legacy UI is retired:

- older same-entity availability success or failure cannot beat a newer mutation;
- successful mutations cannot be overwritten by an older pending reload;
- deletion tombstones prevent late reloads or creates from resurrecting deleted entities;
- late edits update a reloaded entity with the same ID but do not resurrect an absent entity;
- a completed delete wins over intervening edits or availability changes;
- late dialog submissions cannot close or overwrite a newly opened editor;
- route changes and sign-out invalidate pending loads;
- the centralized auth transition is quiet and idempotent.

Implement these with per-resource load revisions, per-entity mutation revisions, deletion tombstones, dialog-instance revisions, and one auth-transition guard. Characterization tests for each invariant must pass before cutover; abort controllers are an optimization, not the correctness mechanism.

## Routing and Migration Rollout

Use a small explicit route table rather than adding a routing dependency unless the implementation needs one:

- `/admin` renders the menu page;
- `/admin/menu` renders the menu page;
- `/admin/tables` renders tables;
- `/stats` renders statistics;
- `/admin/:path*` also serves the React shell so unknown admin paths render a Russian not-found state with a link to the menu.

Direct loads, browser back/forward, document titles, `aria-current`, and main-heading focus must work for every route. `/stats` remains the canonical statistics URL.

Migration is phased:

1. build the React app and deploy it behind preview-only paths while production rewrites remain legacy;
2. run parity, accessibility, and browser smoke tests;
3. switch the admin and statistics rewrites atomically;
4. retain `admin.html`, `admin.js`, and `admin.css` for at least one release as the rollback implementation;
5. rollback by reverting the rewrite/build-entry commit or promoting the previous Vercel deployment.

Rollback is required for failed login/session bootstrap, missing assets, broken API calls, public-route regressions, or any critical menu, table, QR, or statistics workflow failure. Direct `/admin.html` remains a supported legacy rollback URL until the React release is accepted.

## Component, Dependency, and Theme Contracts

Use the official `@shadcn` registry with the `nova` visual style, Tailwind CSS v4, Radix primitives, and `lucide-react` icons. The implementation locks the React 19, Vite 7, Tailwind 4, shadcn CLI, Radix, and lucide package versions in `package-lock.json` during initialization. `components.json` records the selected style, base, aliases, and registry. Generated primitives live in one `components/ui` directory and feature components compose them rather than cloning them. Navigation content is shared between `Sidebar` and `Sheet`. Use semantic theme tokens and `cn()`. Chart rendering must always retain the accessible table fallback, and chart/icon dependencies are bundled rather than loaded from a CDN.

Theme values are `light | dark | system`, stored under `admin-theme`. Invalid values fall back to `system`. System mode observes `prefers-color-scheme`; a pre-render bootstrap sets the theme before React paints to avoid a flash. The theme control exposes the current selection and is keyboard accessible.

## Accessibility Acceptance

Both themes must have visible focus and adequate contrast. Mobile sheets and dialogs trap focus, close on `Escape`, and restore focus to their trigger. Login receives focus after unauthenticated bootstrap or expiry. Fields connect labels, descriptions, and errors through IDs and ARIA. Status/error announcements avoid duplicate speech. Icon-only controls have Russian accessible names, and availability switches name the dish and resulting action. Reduced-motion preferences are honored, touch targets are at least 44×44 CSS pixels, and the chart has an equivalent table.

## Testing and Smoke Data

Add these exact root scripts:

- `test:legacy`: `node scripts/run-node-tests.js`;
- `test:unit`: `vitest run --config admin-app/vitest.config.ts`;
- `test`: `npm run test:legacy && npm run test:unit`;
- `typecheck`: `tsc --noEmit -p admin-app/tsconfig.json`;
- `lint`: `eslint admin-app`;
- `build`: `node scripts/build-admin.js`;
- `test:browser`: `playwright test --config admin-app/playwright.config.ts`.

The legacy runner explicitly enumerates `tests/*.test.js` so CommonJS `node:test` files remain covered. Vitest includes only `admin-app/**/*.{test,spec}.{ts,tsx}` and does not collect the legacy suite. Use Vitest, React Testing Library, user-event, axe checks, and Playwright. Port legacy admin behavior tests before deleting any legacy assertions; rewrite/file-shape assertions change only in the cutover task. Backend, API, router, Python, and public-ordering tests remain unchanged and passing.

Browser tests use long Russian and unbroken stress strings at 320, 390, 768, 1024, and 1440 px. At each viewport assert `document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1`; horizontal overflow is allowed only in designated table scroll containers. Assert bounding-box intersections for availability/actions, category/actions, buttons, dialogs, and mobile navigation.

Production smoke is read-only and requires `ADMIN_SMOKE_BASE_URL`, `ADMIN_SMOKE_LOGIN`, `ADMIN_SMOKE_PASSWORD`, and `ADMIN_SMOKE_READONLY_TABLE_ID`; it verifies authentication shell, all four admin routes, asset loading, statistics response, and the QR response for that existing table. No production mutation is permitted.

Preview mutation smoke requires `ADMIN_SMOKE_BASE_URL`, `ADMIN_SMOKE_LOGIN`, `ADMIN_SMOKE_PASSWORD`, and `ADMIN_SMOKE_PREFIX`. It creates a uniquely prefixed category, dish, and table through the API, uses the returned table ID for QR verification, and deletes all created records in a `finally` cleanup. Cleanup runs in dependency-safe order (table, dish, category), treats `404` as already-cleaned success, retries network errors and HTTP `408`, `425`, `429`, and `5xx` responses three times with 250 ms, 1 s, and 2 s backoff, and fails the test if any other cleanup failure or retry exhaustion remains. A partial setup failure still runs cleanup for every successfully created ID.

Python validation is `python -m pytest bot/tests -q` after installing `bot/requirements.txt` into the project virtual environment. The existing Python suite is required alongside the Node legacy and React suites.

## Completion Criteria

The migration is complete when:

1. all existing admin capabilities work in React;
2. all user-visible admin text is Russian;
3. no tested viewport has overlapping or clipped controls;
4. light and dark themes are readable and persistent;
5. existing Node and Python suites pass;
6. new component and browser tests pass;
7. production smoke tests pass on all four admin routes;
8. the public QR site and independent legacy site remain unchanged.
