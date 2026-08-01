import { expect, test as base, type Page, type Route } from "@playwright/test";

export const LONG_RUSSIAN = "Очень длинное русское название категории для проверки адаптивной вёрстки панели управления";
export const UNBROKEN = "СверхдлиннаяСтрокаБезПробелов".repeat(8).slice(0, 200);

type ApiState = {
  authenticated: boolean;
  categories: Array<Record<string, unknown>>;
  dishes: Array<Record<string, unknown>>;
  tables: Array<Record<string, unknown>>;
  requests: string[];
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json; charset=utf-8", body: JSON.stringify(body) });
}

async function installAdminApi(page: Page, state: ApiState) {
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    state.requests.push(`${method} ${path}${url.search}`);

    if (path === "/api/admin/session") return json(route, { authenticated: state.authenticated });
    if (path === "/api/admin/login") {
      const credentials = request.postDataJSON();
      if (!credentials.login || !credentials.password) return json(route, { error: "Unauthorized" }, 401);
      state.authenticated = true;
      return json(route, { ok: true });
    }
    if (path === "/api/admin/logout") {
      state.authenticated = false;
      return json(route, { ok: true });
    }
    if (path === "/api/admin/categories" && method === "GET") return json(route, { categories: state.categories });
    if (path === "/api/admin/categories" && method === "POST") {
      const input = request.postDataJSON();
      const category = { id: `category-${state.categories.length + 1}`, name: input.name, sort_order: input.sort_order };
      state.categories.push(category);
      return json(route, { category });
    }
    const categoryMatch = path.match(/^\/api\/admin\/categories\/([^/]+)$/);
    if (categoryMatch && method === "PATCH") {
      const category = state.categories.find((item) => item.id === categoryMatch[1])!;
      Object.assign(category, request.postDataJSON());
      return json(route, { category });
    }
    if (categoryMatch && method === "DELETE") {
      state.categories = state.categories.filter((item) => item.id !== categoryMatch[1]);
      return json(route, { ok: true });
    }
    if (path === "/api/admin/dishes" && method === "GET") return json(route, { dishes: state.dishes });
    if (path === "/api/admin/dishes" && method === "POST") {
      const input = request.postDataJSON();
      const dish = { id: `dish-${state.dishes.length + 1}`, ...input };
      state.dishes.push(dish);
      return json(route, { dish });
    }
    const dishMatch = path.match(/^\/api\/admin\/dishes\/([^/]+)$/);
    if (dishMatch && method === "PATCH") {
      const dish = state.dishes.find((item) => item.id === dishMatch[1])!;
      Object.assign(dish, request.postDataJSON());
      return json(route, { dish });
    }
    if (dishMatch && method === "DELETE") {
      state.dishes = state.dishes.filter((item) => item.id !== dishMatch[1]);
      return json(route, { ok: true });
    }
    if (path === "/api/admin/tables" && method === "GET") return json(route, { tables: state.tables });
    if (path === "/api/admin/tables" && method === "POST") {
      const input = request.postDataJSON();
      const table = { id: `table-${state.tables.length + 1}`, number: input.number, created_at: "2026-07-29T10:00:00.000Z" };
      state.tables.push(table);
      return json(route, { table });
    }
    const tableMatch = path.match(/^\/api\/admin\/tables\/([^/]+)$/);
    if (tableMatch && method === "DELETE") {
      state.tables = state.tables.filter((item) => item.id !== tableMatch[1]);
      return json(route, { ok: true });
    }
    if (path.match(/^\/api\/admin\/tables\/[^/]+\/qr$/)) {
      return route.fulfill({
        status: 200,
        headers: { "Content-Type": "image/png", "Content-Disposition": 'attachment; filename="table-qr.png"' },
        body: Buffer.from("mock-png"),
      });
    }
    if (path === "/api/admin/stats") {
      return json(route, {
        range: { from: url.searchParams.get("from"), to: url.searchParams.get("to"), group_by: url.searchParams.get("groupBy"), time_zone: "Asia/Almaty" },
        total_revenue: "123456.78",
        total_profit: "45678.90",
        points: [
          { date: "2026-07-28", revenue: "50000.12", profit: "18000.34" },
          { date: "2026-07-29", revenue: "73456.66", profit: "27678.56" },
        ],
        top_dishes: [{ dish_name: UNBROKEN, quantity: 12 }, { dish_name: LONG_RUSSIAN, quantity: 7 }],
      });
    }
    return json(route, { error: `Unmocked admin endpoint: ${method} ${path}` }, 500);
  });
}

export const test = base.extend<{ apiState: ApiState; mockAdminApi: void }>({
  apiState: async ({}, provide) => {
    const state: ApiState = {
      authenticated: true,
      categories: [{ id: "category-1", name: LONG_RUSSIAN, sort_order: 1 }],
      dishes: [{
        id: "dish-1", category_id: "category-1", name: UNBROKEN,
        description: `${LONG_RUSSIAN} ${UNBROKEN}`, price: "2990.00", cost_price: "1100.00",
        photo_url: null, is_available: true, sort_order: 1,
      }],
      tables: [{ id: "table-1", number: UNBROKEN, created_at: "2026-07-29T10:00:00.000Z" }],
      requests: [],
    };
    await provide(state);
  },
  mockAdminApi: [async ({ page, apiState }, provide) => {
    await installAdminApi(page, apiState);
    await provide();
  }, { auto: true }],
});

export { expect };
