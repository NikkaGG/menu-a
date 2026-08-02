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
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  it("normalizes snake_case statistics order metrics without changing average-check precision", async () => {
    fetchMock.mockResolvedValueOnce(createMockResponse({
      stats: {
        order_count: "1234",
        average_check: "100.005",
      },
    }));
    const api = createAdminApi({ fetchImpl: fetchMock, onUnauthorized });

    const stats = await api.stats({ from: "2026-01-01", to: "2026-01-02", groupBy: "day" });

    expect(stats.orderCount).toBe(1234);
    expect(stats.averageCheck).toBe("100.005");
  });

  it("normalizes camelCase statistics order metrics and preserves null average checks", async () => {
    fetchMock
      .mockResolvedValueOnce(createMockResponse({ stats: { orderCount: 42, averageCheck: "75.50" } }))
      .mockResolvedValueOnce(createMockResponse({ stats: { orderCount: 0, averageCheck: null } }));
    const api = createAdminApi({ fetchImpl: fetchMock, onUnauthorized });

    const camelCase = await api.stats({ from: "2026-01-01", to: "2026-01-02", groupBy: "day" });
    const nullAverage = await api.stats({ from: "2026-01-01", to: "2026-01-02", groupBy: "day" });

    expect(camelCase).toMatchObject({ orderCount: 42, averageCheck: "75.50" });
    expect(nullAverage.averageCheck).toBeNull();
  });

  it.each([
    ["missing", undefined],
    ["malformed", "not-a-number"],
    ["NaN-like", Number.NaN],
    ["negative number", -1],
    ["negative numeric string", "-1"],
    ["fractional number", 1.5],
    ["fractional numeric string", "1.5"],
    ["unsafe number", Number.MAX_SAFE_INTEGER + 1],
    ["unsafe numeric string", "9007199254740992"],
  ])("normalizes %s statistics order counts to zero", async (_label, orderCount) => {
    fetchMock.mockResolvedValueOnce(createMockResponse({ stats: { order_count: orderCount } }));
    const api = createAdminApi({ fetchImpl: fetchMock, onUnauthorized });

    const stats = await api.stats({ from: "2026-01-01", to: "2026-01-02", groupBy: "day" });

    expect(stats.orderCount).toBe(0);
    expect(Number.isNaN(stats.orderCount)).toBe(false);
  });

  it("passes an optional stats abort signal through to fetch and keeps abort errors quiet", async () => {
    const controller = new AbortController();
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
    fetchMock.mockRejectedValueOnce(abortError);
    const api = createAdminApi({ fetchImpl: fetchMock, onUnauthorized });

    await expect(api.stats(
      { from: "2026-01-01", to: "2026-01-02", groupBy: "day" },
      { signal: controller.signal },
    )).rejects.toBe(abortError);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(abortError),
    });
    await expect(api.stats(
      { from: "2026-01-01", to: "2026-01-02", groupBy: "day" },
      { signal: controller.signal },
    )).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/stats?from=2026-01-01&to=2026-01-02&groupBy=day",
      expect.objectContaining({ signal: controller.signal }),
    );
    expect(onUnauthorized).not.toHaveBeenCalled();
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

  it("serializes dish money inputs as finite JSON numbers", async () => {
    fetchMock
      .mockResolvedValueOnce(createMockResponse({ dish: {} }))
      .mockResolvedValueOnce(createMockResponse({ dish: {} }));
    const api = createAdminApi({ fetchImpl: fetchMock, onUnauthorized });

    await api.dishes.create({ category_id: "c", name: "N", description: null, price: "12.30", cost_price: "4.50", photo_url: null, is_available: true, sort_order: 0 });
    await api.dishes.update("d1", { category_id: "c", name: "N", description: null, price: "10.00", cost_price: null, photo_url: null, is_available: true, sort_order: 0 });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ price: 12.3, cost_price: 4.5 });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ price: 10, cost_price: null });
    expect(typeof JSON.parse(fetchMock.mock.calls[0][1].body).price).toBe("number");
  });

  it("rejects invalid dish money before making a request", async () => {
    const api = createAdminApi({ fetchImpl: fetchMock, onUnauthorized });
    await expect(api.dishes.create({ category_id: "c", name: "N", description: null, price: "not-a-number", cost_price: null, photo_url: null, is_available: true, sort_order: 0 })).rejects.toMatchObject({
      message: "Не удалось выполнить действие. Попробуйте ещё раз.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the QR object URL live during click and revokes it once after 1000ms", async () => {
    vi.useFakeTimers();
    const revokeObjectURL = vi.fn();
    const click = vi.fn(() => {
      expect(revokeObjectURL).not.toHaveBeenCalled();
    });
    vi.spyOn(document, "createElement").mockImplementation(() => ({ click, href: "", download: "" } as unknown as HTMLElement));
    const createObjectURL = vi.fn(() => "blob:qr");
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    fetchMock.mockResolvedValue(createMockResponse(new Blob(["qr"]), { headers: { "Content-Disposition": 'attachment; filename="table-12.png"' } }));
    const api = createAdminApi({ fetchImpl: fetchMock, onUnauthorized });

    await api.tables.downloadQr("t1", "12");
    expect(click).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalled();
    expect((document.createElement as unknown as ReturnType<typeof vi.fn>).mock.results[0].value.download).toBe("table-12.png");
    expect(revokeObjectURL).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(999);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:qr");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still schedules one delayed QR URL revocation when click throws", async () => {
    vi.useFakeTimers();
    const clickError = new Error("click failed");
    vi.spyOn(document, "createElement").mockImplementation(() => ({
      click: () => { throw clickError; },
      href: "",
      download: "",
    } as unknown as HTMLElement));
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:qr", revokeObjectURL });
    fetchMock.mockResolvedValue(createMockResponse(new Blob(["qr"])));

    await expect(createAdminApi({ fetchImpl: fetchMock }).tables.downloadQr("t1", "12")).rejects.toBe(clickError);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:qr");
    expect(vi.getTimerCount()).toBe(0);
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

    expect(anchor.download).toBe("secret-report.png");
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

  it("does not let an older login success reset a newer unauthorized transition", async () => {
    let resolveLogin: ((response: Response) => void) | undefined;
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveLogin = resolve; }))
      .mockResolvedValueOnce(createMockResponse({ error: "Unauthorized" }, { status: 401 }))
      .mockResolvedValueOnce(createMockResponse({ error: "Unauthorized" }, { status: 401 }));
    const api = createAdminApi({ fetchImpl: fetchMock, onUnauthorized });

    const oldLogin = api.login({ login: "admin", password: "secret" });
    await expect(api.categories.list()).rejects.toMatchObject({ authHandled: true });
    resolveLogin?.(createMockResponse({ ok: true }));
    await oldLogin;
    await expect(api.dishes.list()).rejects.toMatchObject({ authHandled: true });

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("ignores a protected 401 captured before the current login generation", async () => {
    let resolveProtected: ((response: Response) => void) | undefined;
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveProtected = resolve; }))
      .mockResolvedValueOnce(createMockResponse({ ok: true }))
      .mockResolvedValueOnce(createMockResponse({ error: "Unauthorized" }, { status: 401 }));
    const api = createAdminApi({ fetchImpl: fetchMock, onUnauthorized });

    const staleProtectedRequest = api.categories.list();
    await api.login({ login: "admin", password: "secret" });
    resolveProtected?.(createMockResponse({ error: "Unauthorized" }, { status: 401 }));

    await expect(staleProtectedRequest).rejects.toMatchObject({ authHandled: false });
    expect(onUnauthorized).not.toHaveBeenCalled();
    await expect(api.dishes.list()).rejects.toMatchObject({ authHandled: true });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
