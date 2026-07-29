import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAdminApi, type AdminApiError } from "./api";
import { createMockResponse, installFetchMock } from "../test/mock-api";

describe("typed admin API", () => {
  const fetchMock = vi.fn();
  const onUnauthorized = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    onUnauthorized.mockReset();
    installFetchMock(fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses same-origin credentials and only adds JSON headers for bodies", async () => {
    fetchMock.mockResolvedValueOnce(createMockResponse({ categories: [] }));
    fetchMock.mockResolvedValueOnce(createMockResponse({ category: { id: "1", name: "Суши", sort_order: 1 } }));
    const api = createAdminApi({ fetchImpl: fetchMock, onUnauthorized });

    await api.categories.list();
    await api.categories.create({ name: "Суши", sort_order: 1 });

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "same-origin" });
    expect(fetchMock.mock.calls[0][1].headers).toBeUndefined();
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      credentials: "same-origin",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Суши", sort_order: 1 }),
    });
  });

  it("normalizes JSON responses and preserves money as decimal strings", async () => {
    fetchMock
      .mockResolvedValueOnce(createMockResponse({ dishes: [{ id: "d1", category_id: "c1", name: "Ролл", description: null, price: "1200.50", cost_price: "500.25", photo_url: null, is_available: true, sort_order: 2 }] }))
      .mockResolvedValueOnce(createMockResponse({ stats: { range: { from: "2026-01-01", to: "2026-01-02", group_by: "day", time_zone: "Asia/Almaty" }, total_revenue: "1200.50", total_profit: null, points: [{ date: "2026-01-01", revenue: "1200.50", profit: null }], topDishes: [{ dish_name: "Ролл", quantity: 2 }] } }));
    const api = createAdminApi({ fetchImpl: fetchMock, onUnauthorized });

    const dish = (await api.dishes.list())[0];
    const stats = await api.stats({ from: "2026-01-01", to: "2026-01-02", groupBy: "day" });

    expect(dish).toMatchObject({ categoryId: "c1", costPrice: "500.25", price: "1200.50" });
    expect(typeof dish.price).toBe("string");
    expect(stats).toMatchObject({ totalRevenue: "1200.50", totalProfit: null, topDishes: [{ dishName: "Ролл", quantity: 2 }] });
  });

  it("sends exact snake_case mutation contracts and URL-encodes IDs", async () => {
    fetchMock
      .mockResolvedValueOnce(createMockResponse({ dish: {} }))
      .mockResolvedValueOnce(createMockResponse({ category: {} }))
      .mockResolvedValueOnce(createMockResponse({ table: {} }));
    const api = createAdminApi({ fetchImpl: fetchMock, onUnauthorized });

    await api.dishes.update("id/with space", { category_id: "c", name: "N", description: null, price: "1.20", cost_price: null, photo_url: null, is_available: false, sort_order: 3 });
    await api.categories.update("cat/1", { name: "C", sort_order: 4 });
    await api.tables.create({ number: "12" });

    expect(fetchMock.mock.calls[0][0]).toContain("id%2Fwith%20space");
    expect(fetchMock.mock.calls[0][1].body).toContain('"category_id":"c"');
    expect(fetchMock.mock.calls[1][1].body).toBe(JSON.stringify({ name: "C", sort_order: 4 }));
    expect(fetchMock.mock.calls[2][1].body).toBe(JSON.stringify({ number: "12" }));
  });

  it("handles QR blobs, Content-Disposition names, safe fallback, and revokes URLs after click", async () => {
    const click = vi.fn();
    vi.spyOn(document, "createElement").mockImplementation(() => ({ click, href: "", download: "" } as unknown as HTMLElement));
    const createObjectURL = vi.fn(() => "blob:qr");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    fetchMock.mockResolvedValue(createMockResponse(new Blob(["qr"]), { headers: { "Content-Disposition": 'attachment; filename="table-12.png"' } }));
    const api = createAdminApi({ fetchImpl: fetchMock, onUnauthorized });

    await api.tables.downloadQr("t1", "12");
    expect(click).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:qr");
    expect((document.createElement as unknown as ReturnType<typeof vi.fn>).mock.results[0].value.download).toBe("table-12.png");
  });

  it("uses a sanitized fallback QR filename", async () => {
    const click = vi.fn();
    let anchor: { download?: string } = {};
    vi.spyOn(document, "createElement").mockImplementation(() => {
      anchor = { click, download: "" } as unknown as typeof anchor;
      return anchor as unknown as HTMLElement;
    });
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:qr", revokeObjectURL: vi.fn() });
    fetchMock.mockResolvedValue(createMockResponse(new Blob(["qr"])));
    await createAdminApi({ fetchImpl: fetchMock, onUnauthorized }).tables.downloadQr("t1", "№ 12/А");
    expect(anchor.download).toBe("table-12.png");
  });

  it("sanitizes a server-provided QR filename", async () => {
    const anchor = { click: vi.fn(), download: "" };
    vi.spyOn(document, "createElement").mockImplementation(() => anchor as unknown as HTMLElement);
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:qr", revokeObjectURL: vi.fn() });
    fetchMock.mockResolvedValue(createMockResponse(new Blob(["qr"]), {
      headers: { "Content-Disposition": 'attachment; filename="../secret report.html"' },
    }));

    await createAdminApi({ fetchImpl: fetchMock, onUnauthorized }).tables.downloadQr("t1", "12");

    expect(anchor.download).toBe("secret-report.html");
  });

  it("maps known backend errors without exposing raw details", async () => {
    const cases = [
      ["Unauthorized", "Сессия истекла. Войдите снова."],
      ["Unable to sign in", "Не удалось войти. Проверьте логин и пароль."],
      ["Method not allowed", "Это действие недоступно."],
      ["Invalid category", "Проверьте данные категории."],
      ["Invalid category id", "Категория не найдена."],
      ["Category not found", "Категория не найдена."],
      ["Category is in use", "Категория используется и не может быть удалена."],
      ["Unable to create category", "Не удалось создать категорию."],
      ["Unable to update category", "Не удалось обновить категорию."],
      ["Unable to delete category", "Не удалось удалить категорию."],
      ["Unable to load categories", "Не удалось загрузить категории."],
      ["Invalid dish", "Проверьте данные блюда."],
      ["Invalid dish id", "Блюдо не найдено."],
      ["Dish not found", "Блюдо не найдено."],
      ["Unable to create dish", "Не удалось создать блюдо."],
      ["Unable to update dish", "Не удалось обновить блюдо."],
      ["Unable to delete dish", "Не удалось удалить блюдо."],
      ["Unable to load dishes", "Не удалось загрузить блюда."],
      ["Invalid table", "Проверьте номер или название стола."],
      ["Invalid table id", "Стол не найден."],
      ["Table not found", "Стол не найден."],
      ["Table number already exists", "Стол с таким номером уже существует."],
      ["Table already exists", "Такой стол уже существует."],
      ["Table has an open session", "У стола есть активная сессия."],
      ["Table has session history and cannot be deleted", "Стол с историей заказов удалить нельзя."],
      ["Unable to create table", "Не удалось создать стол."],
      ["Unable to delete table", "Не удалось удалить стол."],
      ["Unable to load tables", "Не удалось загрузить столы."],
      ["Unable to allocate a unique table token", "Не удалось создать стол."],
      ["Unable to generate QR code", "Не удалось создать QR-код."],
      ["Invalid statistics range", "Проверьте выбранный период."],
      ["Unable to load statistics", "Не удалось загрузить статистику."],
    ];
    for (const [serverError, message] of cases) {
      fetchMock.mockResolvedValueOnce(createMockResponse({ error: `${serverError}: secret database detail` }, { status: 500 }));
      await expect(createAdminApi({ fetchImpl: fetchMock, onUnauthorized }).categories.list()).rejects.toMatchObject({ message, status: 500 });
    }
    fetchMock.mockResolvedValueOnce(createMockResponse({ error: "unknown secret" }, { status: 500 }));
    await expect(createAdminApi({ fetchImpl: fetchMock, onUnauthorized }).categories.list()).rejects.toMatchObject({ message: "Не удалось выполнить действие. Попробуйте ещё раз." });
  });

  it.each([
    [401, "Не удалось войти. Проверьте логин и пароль."],
    [429, "Слишком много попыток. Попробуйте позже."],
    [500, "Не удалось выполнить вход. Попробуйте позже."],
  ])("maps login HTTP status %s", async (status, message) => {
    fetchMock.mockResolvedValue(createMockResponse({ error: "server detail" }, { status }));
    await expect(createAdminApi({ fetchImpl: fetchMock, onUnauthorized }).login({ login: "admin", password: "secret" })).rejects.toMatchObject({ message, status });
  });

  it("maps login network errors", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(createAdminApi({ fetchImpl: fetchMock, onUnauthorized }).login({ login: "admin", password: "secret" })).rejects.toMatchObject({ message: "Не удалось выполнить вход. Проверьте подключение к интернету." });
  });

  it("performs one quiet idempotent auth transition for concurrent 401 responses", async () => {
    fetchMock.mockResolvedValue(createMockResponse({ error: "Unauthorized" }, { status: 401 }));
    const api = createAdminApi({ fetchImpl: fetchMock, onUnauthorized });
    await Promise.allSettled([api.categories.list(), api.dishes.list(), api.tables.list()]);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect((onUnauthorized.mock.calls[0][0] as AdminApiError).authHandled).toBe(true);
  });
});
