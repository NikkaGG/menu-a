# Menu release checklist

1. Deploy the repository together: `index.html`, `menu.html`, `qr-ordering.js`, `sw.js`, `manifest.webmanifest`, all three app icons, and the API must have the same release. No database migration is required; the existing primary key on `orders.id` makes repeated request IDs idempotent.
2. Confirm `/t/<real-token>` opens the right table, submit an order, retry its exact POST with the same `request_id`, and confirm the response points to the same order without a second bot notification. Confirm a changed price and a disabled dish each return 409 without a new order.
3. Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run smoke:admin`, and `npm run test:browser` in an environment with the configured database, admin smoke credentials, and Chromium. Check the installed PWA after deployment, including refresh on `/t/:token` and `/order/:id`.

The smoke script requires `ADMIN_SMOKE_BASE_URL`, `ADMIN_SMOKE_LOGIN`, `ADMIN_SMOKE_PASSWORD`, and `ADMIN_SMOKE_READONLY_TABLE_ID`. Do not run destructive test fixtures against production.
