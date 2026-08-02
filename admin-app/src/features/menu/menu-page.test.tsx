import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { toast } from "sonner";

import { AdminApiError } from "@/lib/api";
import type { AdminApi } from "@/lib/api";
import type { Category, Dish } from "@/lib/types";
import * as menuState from "./menu-state";
import { MenuPage } from "./menu-page";

const category = (id: string, name: string, sortOrder = 0): Category => ({ id, name, sortOrder });
const dish = (id: string, categoryId: string, name: string, overrides: Partial<Dish> = {}): Dish => ({
  id,
  categoryId,
  name,
  description: null,
  price: "1000.00",
  costPrice: null,
  photoUrl: null,
  isAvailable: true,
  sortOrder: 0,
  ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mockApi(categories: Category[] = [], dishes: Dish[] = []) {
  return {
    categories: {
      list: vi.fn().mockResolvedValue(categories),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    dishes: {
      list: vi.fn().mockResolvedValue(dishes),
      create: vi.fn(),
      update: vi.fn(),
      setAvailability: vi.fn(),
      delete: vi.fn(),
    },
  } as unknown as AdminApi;
}

describe("MenuPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    if (!HTMLElement.prototype.hasPointerCapture) {
      HTMLElement.prototype.hasPointerCapture = () => false;
      HTMLElement.prototype.setPointerCapture = () => {};
      HTMLElement.prototype.releasePointerCapture = () => {};
    }
    HTMLElement.prototype.scrollIntoView = () => {};
  });

  it("loads categories and dishes concurrently, then renders the empty state", async () => {
    const categories = deferred<Category[]>();
    const dishes = deferred<Dish[]>();
    const api = mockApi();
    vi.mocked(api.categories.list).mockReturnValue(categories.promise);
    vi.mocked(api.dishes.list).mockReturnValue(dishes.promise);

    const { container } = render(<MenuPage api={api} />);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(api.categories.list).toHaveBeenCalledOnce();
    expect(api.dishes.list).toHaveBeenCalledOnce();

    categories.resolve([]);
    dishes.resolve([]);
    expect(await screen.findByText("Категорий пока нет")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Добавить категорию" })).not.toHaveLength(0);
  });

  it.each(["resolve", "reject"] as const)("invalidates deferred loads and ignores their late %s after unmount", async (outcome) => {
    const categories = deferred<Category[]>();
    const dishes = deferred<Dish[]>();
    const api = mockApi();
    vi.mocked(api.categories.list).mockReturnValue(categories.promise);
    vi.mocked(api.dishes.list).mockReturnValue(dishes.promise);
    const invalidate = vi.spyOn(menuState, "invalidateMenuState");
    const unmountedUpdate = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = render(<MenuPage api={api} />);

    expect(api.categories.list).toHaveBeenCalledOnce();
    expect(api.dishes.list).toHaveBeenCalledOnce();
    view.unmount();
    expect(invalidate).toHaveBeenCalledOnce();
    await act(async () => {
      if (outcome === "resolve") {
        categories.resolve([category("late", "Поздняя категория")]);
        dishes.resolve([dish("late", "late", "Позднее блюдо")]);
      } else {
        categories.reject(new Error("late category failure"));
        dishes.reject(new Error("late dish failure"));
      }
      await Promise.allSettled([categories.promise, dishes.promise]);
    });

    expect(unmountedUpdate).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent(/Поздняя|late .* failure/);
    unmountedUpdate.mockRestore();
  });

  it("invalidates a deferred create and suppresses its late toast after unmount", async () => {
    const api = mockApi();
    const creation = deferred<Category>();
    vi.mocked(api.categories.create).mockReturnValue(creation.promise);
    const success = vi.spyOn(toast, "success");
    const user = userEvent.setup();
    const view = render(<MenuPage api={api} />);
    await screen.findByText("Категорий пока нет");
    await user.click(screen.getAllByRole("button", { name: "Добавить категорию" })[0]);
    await user.type(screen.getByLabelText("Название категории"), "Поздняя");
    await user.click(screen.getByRole("button", { name: "Создать категорию" }));

    view.unmount();
    await act(async () => {
      creation.resolve(category("late", "Поздняя"));
      await creation.promise;
    });

    expect(success).not.toHaveBeenCalledWith("Категория создана.");
    success.mockRestore();
  });

  it("invalidates deferred availability and delete work without late notifications after unmount", async () => {
    const api = mockApi([category("c1", "Роллы")], [dish("d1", "c1", "Ролл")]);
    const availability = deferred<Dish>();
    const deletion = deferred<void>();
    vi.mocked(api.dishes.setAvailability).mockReturnValue(availability.promise);
    vi.mocked(api.dishes.delete).mockReturnValue(deletion.promise);
    const success = vi.spyOn(toast, "success");
    const user = userEvent.setup();
    const view = render(<MenuPage api={api} />);
    await user.click(await screen.findByRole("switch", { name: "Скрыть блюдо «Ролл»" }));
    await user.click(screen.getByRole("button", { name: "Удалить блюдо «Ролл»" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Удалить блюдо" }));

    view.unmount();
    await act(async () => {
      availability.resolve(dish("d1", "c1", "Ролл", { isAvailable: false }));
      deletion.resolve();
      await Promise.all([availability.promise, deletion.promise]);
    });

    expect(success).not.toHaveBeenCalledWith("Блюдо скрыто из меню.");
    expect(success).not.toHaveBeenCalledWith("Блюдо удалено.");
    success.mockRestore();
  });

  it("shows a persistent localized load error and retries both resources", async () => {
    const api = mockApi();
    vi.mocked(api.categories.list).mockRejectedValueOnce(new Error("server secret")).mockResolvedValueOnce([]);
    vi.mocked(api.dishes.list).mockRejectedValueOnce(new Error("server secret")).mockResolvedValueOnce([]);
    const user = userEvent.setup();
    render(<MenuPage api={api} />);

    expect(await screen.findByText("Не удалось загрузить меню. Попробуйте ещё раз.")).toBeInTheDocument();
    expect(screen.queryByText("server secret")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Повторить" }));
    await screen.findByText("Категорий пока нет");
    expect(api.categories.list).toHaveBeenCalledTimes(2);
    expect(api.dishes.list).toHaveBeenCalledTimes(2);
  });

  it("shows counts, numeric/name ordering, and a category with no dishes", async () => {
    const api = mockApi(
      [category("c3", "Яки", 2), category("c2", "Азиатское", 1), category("c1", "Бар", 1)],
      [dish("d2", "c2", "Яки", { sortOrder: 1, isAvailable: false }), dish("d1", "c2", "Аки", { sortOrder: 1 })],
    );
    render(<MenuPage api={api} />);

    expect(await screen.findByText("3 категории")).toBeInTheDocument();
    expect(screen.getByText("2 блюда")).toBeInTheDocument();
    expect(screen.getByText("1 доступно")).toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);
    expect(headings).toEqual(["Азиатское", "Бар", "Яки"]);
    expect(screen.getAllByText("В этой категории пока нет блюд")).toHaveLength(2);
    expect(screen.getAllByRole("row").map((row) => row.textContent).join("|")).toMatch(/Аки.*Яки/);
  });

  it("creates and edits a category with exact payloads and prevents duplicate submits", async () => {
    const api = mockApi();
    const create = deferred<Category>();
    vi.mocked(api.categories.create).mockReturnValue(create.promise);
    vi.mocked(api.categories.update).mockResolvedValue(category("c1", "Напитки", 4));
    const user = userEvent.setup();
    render(<MenuPage api={api} />);
    await screen.findByText("Категорий пока нет");

    await user.click(screen.getAllByRole("button", { name: "Добавить категорию" })[0]);
    await user.type(screen.getByLabelText("Название категории"), "Напитки");
    await user.clear(screen.getByLabelText("Порядок сортировки"));
    await user.type(screen.getByLabelText("Порядок сортировки"), "4");
    const save = screen.getByRole("button", { name: "Создать категорию" });
    await user.click(save);
    await user.click(save);
    expect(api.categories.create).toHaveBeenCalledOnce();
    expect(api.categories.create).toHaveBeenCalledWith({ name: "Напитки", sort_order: 4 });
    create.resolve(category("c1", "Напитки", 4));
    expect(await screen.findByRole("heading", { name: "Напитки" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Изменить категорию «Напитки»" }));
    await user.clear(screen.getByLabelText("Название категории"));
    await user.type(screen.getByLabelText("Название категории"), "Чай");
    await user.click(screen.getByRole("button", { name: "Сохранить категорию" }));
    expect(api.categories.update).toHaveBeenCalledWith("c1", { name: "Чай", sort_order: 4 });
  });

  it("keeps a newer category editor open when an older submit completes late", async () => {
    const api = mockApi([category("c1", "Первая"), category("c2", "Вторая")]);
    const late = deferred<Category>();
    vi.mocked(api.categories.update).mockReturnValueOnce(late.promise);
    const user = userEvent.setup();
    render(<MenuPage api={api} />);
    await screen.findByRole("heading", { name: "Первая" });

    await user.click(screen.getByRole("button", { name: "Изменить категорию «Первая»" }));
    await user.click(screen.getByRole("button", { name: "Сохранить категорию" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Изменить категорию «Вторая»" }));
    late.resolve(category("c1", "Первая"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByDisplayValue("Вторая")).toBeInTheDocument();
  });

  it("does not let an older rejection unlock or add an error to a newer pending editor", async () => {
    const api = mockApi([category("c1", "Первая"), category("c2", "Вторая")]);
    const older = deferred<Category>();
    const newer = deferred<Category>();
    vi.mocked(api.categories.update).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const user = userEvent.setup();
    render(<MenuPage api={api} />);
    await screen.findByRole("heading", { name: "Первая" });

    await user.click(screen.getByRole("button", { name: "Изменить категорию «Первая»" }));
    await user.click(screen.getByRole("button", { name: "Сохранить категорию" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Изменить категорию «Вторая»" }));
    await user.click(screen.getByRole("button", { name: "Сохранить категорию" }));
    older.reject(new Error("old failure"));

    await waitFor(() => expect(api.categories.update).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Сохранить категорию" })).toBeDisabled();
    expect(screen.queryByText("Не удалось сохранить категорию. Попробуйте ещё раз.")).not.toBeInTheDocument();
    newer.resolve(category("c2", "Вторая"));
  });

  it("validates category input and reports safe form errors", async () => {
    const api = mockApi();
    vi.mocked(api.categories.create).mockRejectedValue(new Error("database internals"));
    const user = userEvent.setup();
    render(<MenuPage api={api} />);
    await screen.findByText("Категорий пока нет");
    await user.click(screen.getAllByRole("button", { name: "Добавить категорию" })[0]);
    await user.click(screen.getByRole("button", { name: "Создать категорию" }));
    expect(screen.getByText("Введите название категории.")).toBeInTheDocument();
    expect(screen.getByLabelText("Название категории")).toHaveAttribute("aria-invalid", "true");
    await user.type(screen.getByLabelText("Название категории"), "Супы");
    await user.click(screen.getByRole("button", { name: "Создать категорию" }));
    expect(await screen.findByText("Не удалось сохранить категорию. Попробуйте ещё раз.")).toBeInTheDocument();
    expect(screen.queryByText("database internals")).not.toBeInTheDocument();
  });

  it("rejects category sort orders outside the backend integer range before the API", async () => {
    const api = mockApi();
    vi.mocked(api.categories.create).mockResolvedValue(category("c1", "Роллы", 2147483647));
    const user = userEvent.setup();
    render(<MenuPage api={api} />);
    await screen.findByText("Категорий пока нет");
    await user.click(screen.getAllByRole("button", { name: "Добавить категорию" })[0]);
    const sortOrder = screen.getByLabelText("Порядок сортировки");
    expect(sortOrder).toHaveAttribute("min", "0");
    expect(sortOrder).toHaveAttribute("max", "2147483647");
    expect(sortOrder).toHaveAttribute("step", "1");
    for (const value of ["-1", "2147483648", "1.5", ""]) {
      await user.clear(sortOrder);
      if (value) await user.type(sortOrder, value);
      await user.click(screen.getByRole("button", { name: "Создать категорию" }));
      expect(screen.getByText("Порядок сортировки должен быть целым числом от 0 до 2147483647.")).toBeInTheDocument();
      expect(api.categories.create).not.toHaveBeenCalled();
    }
    await user.clear(sortOrder);
    await user.type(sortOrder, "2147483647");
    await user.type(screen.getByLabelText("Название категории"), "Роллы");
    await user.click(screen.getByRole("button", { name: "Создать категорию" }));
    expect(api.categories.create).toHaveBeenCalledWith({ name: "Роллы", sort_order: 2147483647 });
  });

  it("preserves mapped category save and delete errors while hiding unknown details", async () => {
    const api = mockApi([category("c1", "Роллы")]);
    vi.mocked(api.categories.update).mockRejectedValue(new AdminApiError("Категория не найдена."));
    vi.mocked(api.categories.delete).mockRejectedValue(new AdminApiError("Категория используется и не может быть удалена."));
    const user = userEvent.setup();
    render(<MenuPage api={api} />);
    await screen.findByRole("heading", { name: "Роллы" });
    await user.click(screen.getByRole("button", { name: "Изменить категорию «Роллы»" }));
    await user.click(screen.getByRole("button", { name: "Сохранить категорию" }));
    expect(await screen.findByText("Категория не найдена.")).toBeInTheDocument();
    expect(screen.queryByText("Категория не найдена.")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Удалить категорию «Роллы»" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Удалить категорию" }));
    expect(await screen.findByText("Категория используется и не может быть удалена.")).toBeInTheDocument();
  });

  it("creates a dish with exact nullable fields, category, sort order, and availability", async () => {
    const api = mockApi([category("c1", "Роллы")]);
    vi.mocked(api.dishes.create).mockResolvedValue(dish("d1", "c1", "Филадельфия", { price: "1250.50", sortOrder: 3, isAvailable: false }));
    const user = userEvent.setup();
    render(<MenuPage api={api} />);
    await screen.findByRole("heading", { name: "Роллы" });

    await user.click(screen.getByRole("button", { name: "Добавить блюдо в категорию «Роллы»" }));
    await user.type(screen.getByLabelText("Название блюда"), "Филадельфия");
    await user.type(screen.getByLabelText("Цена"), "1250.50");
    await user.clear(screen.getByLabelText("Порядок сортировки"));
    await user.type(screen.getByLabelText("Порядок сортировки"), "3");
    await user.click(screen.getByRole("switch", { name: "Блюдо доступно" }));
    await user.click(screen.getByRole("button", { name: "Создать блюдо" }));

    expect(api.dishes.create).toHaveBeenCalledWith({
      category_id: "c1",
      name: "Филадельфия",
      description: null,
      price: "1250.50",
      cost_price: null,
      photo_url: null,
      is_available: false,
      sort_order: 3,
    });
  });

  it("rejects dish sort orders outside the backend integer range before the API", async () => {
    const api = mockApi([category("c1", "Роллы")]);
    vi.mocked(api.dishes.create).mockResolvedValue(dish("d1", "c1", "Ролл", { sortOrder: 2147483647 }));
    const user = userEvent.setup();
    render(<MenuPage api={api} />);
    await screen.findByRole("heading", { name: "Роллы" });
    await user.click(screen.getByRole("button", { name: "Добавить блюдо в категорию «Роллы»" }));
    const sortOrder = screen.getByLabelText("Порядок сортировки");
    expect(sortOrder).toHaveAttribute("min", "0");
    expect(sortOrder).toHaveAttribute("max", "2147483647");
    expect(sortOrder).toHaveAttribute("step", "1");
    await user.type(screen.getByLabelText("Название блюда"), "Ролл");
    await user.type(screen.getByLabelText("Цена"), "100");
    for (const value of ["-1", "2147483648", "1.5", ""]) {
      await user.clear(sortOrder);
      if (value) await user.type(sortOrder, value);
      await user.click(screen.getByRole("button", { name: "Создать блюдо" }));
      expect(screen.getByText("Порядок сортировки должен быть целым числом от 0 до 2147483647.")).toBeInTheDocument();
      expect(api.dishes.create).not.toHaveBeenCalled();
    }
    await user.clear(sortOrder);
    await user.type(sortOrder, "2147483647");
    await user.click(screen.getByRole("button", { name: "Создать блюдо" }));
    expect(api.dishes.create).toHaveBeenCalledWith(expect.objectContaining({ sort_order: 2147483647 }));
  });

  it("validates dish fields and photo URLs without rendering unsafe previews", async () => {
    const api = mockApi([category("c1", "Роллы")]);
    const user = userEvent.setup();
    render(<MenuPage api={api} />);
    await screen.findByRole("heading", { name: "Роллы" });
    await user.click(screen.getByRole("button", { name: "Добавить блюдо в категорию «Роллы»" }));
    await user.type(screen.getByLabelText("Название блюда"), "Ролл");
    await user.type(screen.getByLabelText("Цена"), "-1");
    await user.type(screen.getByLabelText("Ссылка на фото"), "javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: "Создать блюдо" }));
    expect(screen.getByText("Введите корректную цену больше или равную нулю.")).toBeInTheDocument();
    expect(screen.getByText("Укажите безопасную ссылку http(s) или путь от корня сайта.")).toBeInTheDocument();
    expect(document.querySelector('img[src^="javascript:"]')).toBeNull();
  });

  it("edits a dish with selected category and exact optional-field payload", async () => {
    const api = mockApi(
      [category("c1", "Роллы"), category("c2", "Супы")],
      [dish("d1", "c1", "Ролл", { description: null, costPrice: null, photoUrl: null })],
    );
    vi.mocked(api.dishes.update).mockResolvedValue(dish("d1", "c2", "Суп", {
      description: "Горячий суп",
      price: "900.00",
      costPrice: "300.00",
      photoUrl: "/photos/soup.jpg",
      isAvailable: false,
      sortOrder: 2,
    }));
    const user = userEvent.setup();
    render(<MenuPage api={api} />);
    await screen.findByText("Ролл");
    await user.click(screen.getByRole("button", { name: "Изменить блюдо «Ролл»" }));
    await user.clear(screen.getByLabelText("Название блюда"));
    await user.type(screen.getByLabelText("Название блюда"), "Суп");
    const categorySelect = screen.getByRole("combobox", { name: "Категория" });
    categorySelect.focus();
    await user.keyboard("{Enter}{End}{Enter}");
    await user.type(screen.getByLabelText("Описание"), "Горячий суп");
    await user.clear(screen.getByLabelText("Цена"));
    await user.type(screen.getByLabelText("Цена"), "900.00");
    await user.type(screen.getByLabelText("Себестоимость"), "300.00");
    await user.type(screen.getByLabelText("Ссылка на фото"), "/photos/soup.jpg");
    await user.clear(screen.getByLabelText("Порядок сортировки"));
    await user.type(screen.getByLabelText("Порядок сортировки"), "2");
    await user.click(screen.getByRole("switch", { name: "Блюдо доступно" }));
    await user.click(screen.getByRole("button", { name: "Сохранить блюдо" }));

    expect(api.dishes.update).toHaveBeenCalledWith("d1", {
      category_id: "c2",
      name: "Суп",
      description: "Горячий суп",
      price: "900.00",
      cost_price: "300.00",
      photo_url: "/photos/soup.jpg",
      is_available: false,
      sort_order: 2,
    });
  });

  it("keeps a newer dish editor open when an older submit completes late", async () => {
    const api = mockApi(
      [category("c1", "Роллы")],
      [dish("d1", "c1", "Первый"), dish("d2", "c1", "Второй")],
    );
    const late = deferred<Dish>();
    vi.mocked(api.dishes.update).mockReturnValueOnce(late.promise);
    const user = userEvent.setup();
    render(<MenuPage api={api} />);
    await screen.findByText("Первый");

    await user.click(screen.getByRole("button", { name: "Изменить блюдо «Первый»" }));
    await user.click(screen.getByRole("button", { name: "Сохранить блюдо" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Изменить блюдо «Второй»" }));
    late.resolve(dish("d1", "c1", "Первый"));

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(screen.getByDisplayValue("Второй")).toBeInTheDocument();
  });

  it("preserves mapped dish save and delete errors", async () => {
    const api = mockApi([category("c1", "Роллы")], [dish("d1", "c1", "Ролл")]);
    vi.mocked(api.dishes.update).mockRejectedValue(new AdminApiError("Блюдо не найдено."));
    vi.mocked(api.dishes.delete).mockRejectedValue(new AdminApiError("Не удалось удалить блюдо."));
    const user = userEvent.setup();
    render(<MenuPage api={api} />);
    await screen.findByText("Ролл");

    await user.click(screen.getByRole("button", { name: "Изменить блюдо «Ролл»" }));
    await user.click(screen.getByRole("button", { name: "Сохранить блюдо" }));
    expect(await screen.findByText("Блюдо не найдено.")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Удалить блюдо «Ролл»" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Удалить блюдо" }));
    expect(await screen.findByText("Не удалось удалить блюдо.")).toBeInTheDocument();
  });

  it("optimistically toggles availability, exposes pending intent, and rolls back current failure", async () => {
    const api = mockApi([category("c1", "Роллы")], [dish("d1", "c1", "Ролл")]);
    const update = deferred<Dish>();
    vi.mocked(api.dishes.setAvailability).mockReturnValue(update.promise);
    const user = userEvent.setup();
    render(<MenuPage api={api} />);
    const toggle = await screen.findByRole("switch", { name: "Скрыть блюдо «Ролл»" });
    await user.click(toggle);
    expect(screen.getByRole("switch", { name: "Показать блюдо «Ролл»" })).toBeDisabled();
    update.reject(new Error("secret"));
    expect(await screen.findByRole("switch", { name: "Скрыть блюдо «Ролл»" })).toBeEnabled();
    expect(screen.getByText("Не удалось изменить доступность блюда. Попробуйте ещё раз.")).toBeInTheDocument();
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });

  it("clears a stale availability pending marker after a newer dish edit", async () => {
    const api = mockApi([category("c1", "Роллы")], [dish("d1", "c1", "Ролл")]);
    const availability = deferred<Dish>();
    vi.mocked(api.dishes.setAvailability).mockReturnValue(availability.promise);
    vi.mocked(api.dishes.update).mockResolvedValue(dish("d1", "c1", "Ролл"));
    const user = userEvent.setup();
    render(<MenuPage api={api} />);
    await user.click(await screen.findByRole("switch", { name: "Скрыть блюдо «Ролл»" }));
    await user.click(screen.getByRole("button", { name: "Изменить блюдо «Ролл»" }));
    await user.click(screen.getByRole("button", { name: "Сохранить блюдо" }));
    availability.resolve(dish("d1", "c1", "Ролл", { isAvailable: false }));

    expect(await screen.findByRole("switch", { name: "Скрыть блюдо «Ролл»" })).toBeEnabled();
  });

  it("uses proper confirmation dialogs and exact delete calls", async () => {
    const api = mockApi([category("c1", "Роллы")], [dish("d1", "c1", "Ролл")]);
    vi.mocked(api.dishes.delete).mockResolvedValue();
    vi.mocked(api.categories.delete).mockResolvedValue();
    const user = userEvent.setup();
    render(<MenuPage api={api} />);
    await screen.findByText("Ролл");

    await user.click(screen.getByRole("button", { name: "Удалить блюдо «Ролл»" }));
    const dishDialog = screen.getByRole("alertdialog");
    expect(within(dishDialog).getByText(/действие нельзя отменить/i)).toBeInTheDocument();
    await user.click(within(dishDialog).getByRole("button", { name: "Удалить блюдо" }));
    expect(api.dishes.delete).toHaveBeenCalledWith("d1");

    await user.click(screen.getByRole("button", { name: "Удалить категорию «Роллы»" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Удалить категорию" }));
    expect(api.categories.delete).toHaveBeenCalledWith("c1");
  });

  it("wraps long content, stacks actions, and has no page-level fixed minimum width", async () => {
    const long = "ОченьДлинноеНазваниеБезПробелов".repeat(10);
    const api = mockApi([category("c1", long)], [dish("d1", "c1", long, { description: long })]);
    const { container } = render(<MenuPage api={api} />);
    await screen.findByText(long, { selector: "h2" });
    const page = container.querySelector('[data-menu-page="true"]');
    expect(page?.className).toContain("min-w-0");
    expect(page?.className).not.toMatch(/min-w-\[(?!0)/);
    expect(container.querySelectorAll(".\\[overflow-wrap\\:anywhere\\]").length).toBeGreaterThan(0);
    expect(container.querySelector('[data-dish-actions="true"]')?.className).toMatch(/flex-col/);
    expect(container.querySelector("h2")?.className ?? "").toMatch(/overflow-wrap/);
    const editButton = screen.getByRole("button", { name: `Изменить блюдо «${long}»` });
    const deleteButton = screen.getByRole("button", { name: `Удалить блюдо «${long}»` });
    expect(within(editButton).getByText("Изменить")).toBeVisible();
    expect(within(deleteButton).getByText("Удалить")).toBeVisible();
    expect(within(editButton).getByText("Изменить")).not.toHaveClass("sr-only");
    expect(within(deleteButton).getByText("Удалить")).not.toHaveClass("sr-only");
  });

  it("has accessible page and dialogs, descriptions, target sizes, focus restoration, and Escape", async () => {
    const api = mockApi([category("c1", "Роллы")], [dish("d1", "c1", "Ролл")]);
    const user = userEvent.setup();
    const { container } = render(<MenuPage api={api} />);
    await screen.findByText("Ролл");
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);

    const categoryTrigger = screen.getByRole("button", { name: "Изменить категорию «Роллы»" });
    expect(categoryTrigger.className).toMatch(/min-h-11/);
    await user.click(categoryTrigger);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleDescription();
    expect(within(dialog).getByRole("button", { name: "Закрыть" }).className).toMatch(/min-h-11/);
    expect(within(dialog).getByRole("button", { name: "Отмена" }).className).toMatch(/min-h-11/);
    expect(within(dialog).getByRole("button", { name: "Сохранить категорию" }).className).toMatch(/min-h-11/);
    expect((await axe(dialog, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.keyboard("{Escape}");
    expect(categoryTrigger).toHaveFocus();

    const dishTrigger = screen.getByRole("button", { name: "Изменить блюдо «Ролл»" });
    await user.click(dishTrigger);
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription();
    expect((await axe(screen.getByRole("dialog"), { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });
});
