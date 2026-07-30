import type {
  Category,
  CategoryInput,
  Dish,
  DishInput,
  Statistics,
  Table,
  TableInput,
  LoginResult,
  Session,
} from "./types";

const FALLBACK_MESSAGE = "Не удалось выполнить действие. Попробуйте ещё раз.";

const ERROR_MESSAGES: Record<string, string> = {
  Unauthorized: "Сессия истекла. Войдите снова.",
  "Unable to sign in": "Не удалось войти. Проверьте логин и пароль.",
  "Method not allowed": "Это действие недоступно.",
  "Invalid category": "Проверьте данные категории.",
  "Invalid category id": "Категория не найдена.",
  "Category not found": "Категория не найдена.",
  "Category is in use": "Категория используется и не может быть удалена.",
  "Unable to create category": "Не удалось создать категорию.",
  "Unable to update category": "Не удалось обновить категорию.",
  "Unable to delete category": "Не удалось удалить категорию.",
  "Unable to load categories": "Не удалось загрузить категории.",
  "Invalid dish": "Проверьте данные блюда.",
  "Invalid dish id": "Блюдо не найдено.",
  "Dish not found": "Блюдо не найдено.",
  "Unable to create dish": "Не удалось создать блюдо.",
  "Unable to update dish": "Не удалось обновить блюдо.",
  "Unable to delete dish": "Не удалось удалить блюдо.",
  "Unable to load dishes": "Не удалось загрузить блюда.",
  "Invalid table": "Проверьте номер или название стола.",
  "Invalid table id": "Стол не найден.",
  "Table not found": "Стол не найден.",
  "Table number already exists": "Стол с таким номером уже существует.",
  "Table already exists": "Такой стол уже существует.",
  "Table has an open session": "У стола есть активная сессия.",
  "Table has session history and cannot be deleted": "Стол с историей заказов удалить нельзя.",
  "Unable to create table": "Не удалось создать стол.",
  "Unable to delete table": "Не удалось удалить стол.",
  "Unable to load tables": "Не удалось загрузить столы.",
  "Unable to allocate a unique table token": "Не удалось создать стол.",
  "Unable to generate QR code": "Не удалось создать QR-код.",
  "Invalid statistics range": "Проверьте выбранный период.",
  "Unable to load statistics": "Не удалось загрузить статистику.",
};

export class AdminApiError extends Error {
  readonly status?: number;
  readonly authHandled: boolean;

  constructor(message: string, options: { status?: number; authHandled?: boolean } = {}) {
    super(message);
    this.name = "AdminApiError";
    this.status = options.status;
    this.authHandled = options.authHandled ?? false;
  }
}

type RawRecord = Record<string, unknown>;
type Fetch = typeof fetch;

export type AdminApiOptions = {
  fetchImpl?: Fetch;
  onUnauthorized?: (error: AdminApiError) => void;
};

function record(value: unknown): RawRecord {
  return value && typeof value === "object" ? (value as RawRecord) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function nullableText(value: unknown): string | null {
  return value == null ? null : text(value);
}

function moneyNumber(value: string | number): number {
  const number = typeof value === "string" && value.trim() === "" ? Number.NaN : Number(value);
  if (!Number.isFinite(number)) throw new AdminApiError(FALLBACK_MESSAGE);
  return number;
}

function dishRequestBody(input: DishInput): RawRecord {
  return {
    ...input,
    price: moneyNumber(input.price),
    cost_price: input.cost_price == null ? null : moneyNumber(input.cost_price),
  };
}

function category(value: unknown): Category {
  const raw = record(value);
  return { id: text(raw.id), name: text(raw.name), sortOrder: Number(raw.sortOrder ?? raw.sort_order ?? 0) };
}

function dish(value: unknown): Dish {
  const raw = record(value);
  return {
    id: text(raw.id),
    categoryId: text(raw.categoryId ?? raw.category_id),
    name: text(raw.name),
    description: nullableText(raw.description),
    price: text(raw.price),
    costPrice: nullableText(raw.costPrice ?? raw.cost_price),
    photoUrl: nullableText(raw.photoUrl ?? raw.photo_url),
    isAvailable: Boolean(raw.isAvailable ?? raw.is_available),
    sortOrder: Number(raw.sortOrder ?? raw.sort_order ?? 0),
  };
}

function table(value: unknown): Table {
  const raw = record(value);
  return {
    id: text(raw.id),
    number: text(raw.number),
    createdAt: text(raw.createdAt ?? raw.created_at),
  };
}

function statistics(value: unknown): Statistics {
  const raw = record(value);
  const range = record(raw.range);
  return {
    range: {
      from: text(range.from),
      to: text(range.to),
      groupBy: text(range.groupBy ?? range.group_by) as Statistics["range"]["groupBy"],
      timeZone: text(range.timeZone ?? range.time_zone),
    },
    totalRevenue: text(raw.totalRevenue ?? raw.total_revenue),
    totalProfit: nullableText(raw.totalProfit ?? raw.total_profit),
    points: (Array.isArray(raw.points) ? raw.points : []).map((value) => {
      const point = record(value);
      return { date: text(point.date), revenue: text(point.revenue), profit: nullableText(point.profit) };
    }),
    topDishes: (Array.isArray(raw.topDishes ?? raw.top_dishes) ? (raw.topDishes ?? raw.top_dishes) as unknown[] : []).map((value) => {
      const topDish = record(value);
      return { dishName: text(topDish.dishName ?? topDish.dish_name), quantity: Number(topDish.quantity) };
    }),
  };
}

function localizedError(serverError: unknown): string {
  if (typeof serverError !== "string") return FALLBACK_MESSAGE;
  const exact = ERROR_MESSAGES[serverError];
  if (exact) return exact;
  const knownPrefix = Object.keys(ERROR_MESSAGES).find((key) => serverError.startsWith(`${key}:`));
  return knownPrefix ? ERROR_MESSAGES[knownPrefix] : FALLBACK_MESSAGE;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "name" in error
    && error.name === "AbortError";
}

async function responseBody(response: Response): Promise<RawRecord> {
  try {
    return record(await response.json());
  } catch (error) {
    if (isAbortError(error)) throw error;
    return {};
  }
}

function qrFilename(disposition: string | null, tableNumber: string): string {
  const safeParsedFilename = (value: string | undefined): string | null => {
    if (!value) return null;
    const basename = value.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim() ?? "";
    const safe = basename.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
    if (!safe) return null;
    const stem = safe.replace(/\.[^.]+$/, "") || "qr";
    return `${stem}.png`;
  };
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      const parsed = safeParsedFilename(decodeURIComponent(encoded.replace(/^"|"$/g, "")));
      if (parsed) return parsed;
    } catch {
      // Ignore malformed server filenames and use the safe fallback.
    }
  }
  const regular = safeParsedFilename(disposition?.match(/filename="?([^";]+)"?/i)?.[1]);
  if (regular) return regular;
  const safeNumber = tableNumber.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "qr";
  return `table-${safeNumber}.png`;
}

export function createAdminApi(options: AdminApiOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  let authTransitioned = false;
  let authGeneration = 0;
  let latestLoginRequest = 0;

  async function request(path: string, init: RequestInit = {}, loginRequest = false): Promise<RawRecord> {
    const requestGeneration = authGeneration;
    const hasBody = init.body !== undefined;
    let response: Response;
    try {
      response = await fetchImpl(path, {
        ...init,
        credentials: "same-origin",
        headers: hasBody ? { "Content-Type": "application/json", ...init.headers } : init.headers,
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new AdminApiError(
        loginRequest
          ? "Не удалось выполнить вход. Проверьте подключение к интернету."
          : FALLBACK_MESSAGE,
      );
    }

    const body = await responseBody(response);
    if (!response.ok) {
      const message = loginRequest
        ? response.status === 401
          ? "Не удалось войти. Проверьте логин и пароль."
          : response.status === 429
            ? "Слишком много попыток. Попробуйте позже."
            : "Не удалось выполнить вход. Попробуйте позже."
        : localizedError(body.error);
      const authHandled = !loginRequest
        && response.status === 401
        && requestGeneration === authGeneration;
      const error = new AdminApiError(message, { status: response.status, authHandled });
      if (authHandled && !authTransitioned) {
        authTransitioned = true;
        authGeneration += 1;
        options.onUnauthorized?.(error);
      }
      throw error;
    }
    return body;
  }

  async function qr(id: string, number: string): Promise<void> {
    const requestGeneration = authGeneration;
    let response: Response;
    try {
      response = await fetchImpl(`/api/admin/tables/${encodeURIComponent(id)}/qr`, { credentials: "same-origin" });
    } catch {
      throw new AdminApiError(FALLBACK_MESSAGE);
    }
    if (!response.ok) {
      const body = await responseBody(response);
      const authHandled = response.status === 401
        && requestGeneration === authGeneration;
      const error = new AdminApiError(localizedError(body.error), { status: response.status, authHandled });
      if (authHandled && !authTransitioned) {
        authTransitioned = true;
        authGeneration += 1;
        options.onUnauthorized?.(error);
      }
      throw error;
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = qrFilename(response.headers.get("Content-Disposition"), number);
    try {
      link.click();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  return {
    session: async (): Promise<Session> => {
      const body = await request("/api/admin/session");
      return { authenticated: Boolean(body.authenticated) };
    },
    login: async (credentials: { login: string; password: string }): Promise<LoginResult> => {
      const loginRequest = ++latestLoginRequest;
      const loginGeneration = authGeneration;
      const body = await request("/api/admin/login", { method: "POST", body: JSON.stringify(credentials) }, true);
      if (loginRequest === latestLoginRequest && loginGeneration === authGeneration) {
        authGeneration += 1;
        authTransitioned = false;
      }
      return { ok: Boolean(body.ok) };
    },
    logout: async (): Promise<void> => {
      await request("/api/admin/logout", { method: "POST" });
    },
    categories: {
      list: async () => {
        const body = await request("/api/admin/categories");
        return (Array.isArray(body.categories) ? body.categories : []).map(category);
      },
      create: async (input: CategoryInput) => category((await request("/api/admin/categories", { method: "POST", body: JSON.stringify(input) })).category),
      update: async (id: string, input: CategoryInput) => category((await request(`/api/admin/categories/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) })).category),
      delete: async (id: string): Promise<void> => {
        await request(`/api/admin/categories/${encodeURIComponent(id)}`, { method: "DELETE" });
      },
    },
    dishes: {
      list: async () => {
        const body = await request("/api/admin/dishes");
        return (Array.isArray(body.dishes) ? body.dishes : []).map(dish);
      },
      create: async (input: DishInput) => dish((await request("/api/admin/dishes", { method: "POST", body: JSON.stringify(dishRequestBody(input)) })).dish),
      update: async (id: string, input: DishInput) => dish((await request(`/api/admin/dishes/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(dishRequestBody(input)) })).dish),
      setAvailability: async (id: string, isAvailable: boolean) => dish((await request(`/api/admin/dishes/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ is_available: isAvailable }) })).dish),
      delete: async (id: string): Promise<void> => {
        await request(`/api/admin/dishes/${encodeURIComponent(id)}`, { method: "DELETE" });
      },
    },
    tables: {
      list: async () => {
        const body = await request("/api/admin/tables");
        return (Array.isArray(body.tables) ? body.tables : []).map(table);
      },
      create: async (input: TableInput) => table((await request("/api/admin/tables", { method: "POST", body: JSON.stringify(input) })).table),
      delete: async (id: string): Promise<void> => {
        await request(`/api/admin/tables/${encodeURIComponent(id)}`, { method: "DELETE" });
      },
      downloadQr: qr,
    },
    stats: async (
      query: { from: string; to: string; groupBy: "day" | "week" | "month" },
      requestOptions: { signal?: AbortSignal } = {},
    ) => {
      const params = new URLSearchParams(query);
      const body = await request(`/api/admin/stats?${params}`, requestOptions.signal ? { signal: requestOptions.signal } : {});
      return statistics(body.stats ?? body);
    },
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;
export { ERROR_MESSAGES };
