import type { Locator, Page } from "@playwright/test";

import { expect, LONG_RUSSIAN, test, UNBROKEN } from "../src/test/fixtures";

async function expectNoPageOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    overflow: [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => {
        const overflowX = getComputedStyle(element).overflowX;
        return element.scrollWidth > element.clientWidth + 1 && (overflowX === "auto" || overflowX === "scroll");
      })
      .map((element) => ({
        tag: element.tagName,
        slot: element.getAttribute("data-slot"),
        className: element.className,
        testId: element.getAttribute("data-table-scroll"),
        allowed: Boolean(element.closest("[data-table-scroll]")),
      })),
  }));
  expect(metrics.scrollWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(metrics.overflow.filter((item) => !item.allowed), JSON.stringify(metrics)).toEqual([]);
}

async function expectNoIntersections(locator: Locator) {
  const boxes = await locator.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
  }));
  for (let first = 0; first < boxes.length; first += 1) {
    for (let second = first + 1; second < boxes.length; second += 1) {
      const a = boxes[first];
      const b = boxes[second];
      const intersects = Math.min(a.right, b.right) > Math.max(a.left, b.left)
        && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
      expect(intersects, `controls ${first} and ${second} intersect`).toBe(false);
    }
  }
}

async function expectDialogKeyboardContract(page: Page, trigger: Locator, name: RegExp) {
  await trigger.focus();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/./);
  const focusedInside = await dialog.evaluate((element) => element.contains(document.activeElement));
  expect(focusedInside).toBe(true);
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
}

test("direct routes, aliases, history, titles, current navigation and heading focus", async ({ page }) => {
  const routes = [
    ["/admin", "Управление меню", "Управление меню — Панель управления"],
    ["/admin/menu", "Управление меню", "Управление меню — Панель управления"],
    ["/admin/tables", "Столы и QR-коды", "Столы и QR-коды — Панель управления"],
    ["/stats", "Статистика", "Статистика — Панель управления"],
    ["/admin-next", "Управление меню", "Управление меню — Панель управления"],
    ["/admin-next/menu", "Управление меню", "Управление меню — Панель управления"],
    ["/admin-next/tables", "Столы и QR-коды", "Столы и QR-коды — Панель управления"],
    ["/admin-next/stats", "Статистика", "Статистика — Панель управления"],
  ] as const;
  for (const [path, heading, title] of routes) {
    await page.goto(path);
    await expect(page).toHaveTitle(title);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeFocused();
    await expectNoPageOverflow(page);
  }

  await page.goto("/admin/menu");
  if ((page.viewportSize()?.width ?? 0) < 768) {
    await page.getByRole("button", { name: "Открыть меню" }).click();
  }
  await page.getByRole("link", { name: "Столы и QR-коды" }).click();
  await expect(page).toHaveURL(/\/admin\/tables$/);
  await expect(page.getByRole("link", { name: "Столы и QR-коды" })).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/menu$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/admin\/tables$/);
});

test("login, logout and theme choices work without real credentials", async ({ page, apiState }) => {
  apiState.authenticated = false;
  await page.goto("/admin");
  await expect(page.getByLabel("Логин")).toBeFocused();
  await page.getByLabel("Логин").fill("локальный");
  await page.getByLabel("Пароль").fill("не-настоящий-пароль");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Управление меню" })).toBeVisible();

  const theme = page.getByRole("button", { name: /^Тема:/ });
  for (const [choice, stored, dark] of [
    ["Тёмная", "dark", true],
    ["Светлая", "light", false],
    ["Системная", "system", false],
  ] as const) {
    await theme.click();
    await page.getByRole("menuitemradio", { name: choice }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("admin-theme"))).toBe(stored);
    await expect.poll(() => page.locator("html").evaluate((element) => element.classList.contains("dark"))).toBe(dark);
  }
  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page.getByRole("heading", { name: "Вход в панель управления" })).toBeVisible();
});

test("mobile sheet traps focus, closes with Escape and restores its trigger", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "mobile navigation is hidden at this viewport");
  await page.goto("/admin");
  const trigger = page.getByRole("button", { name: "Открыть меню" });
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "Навигация" });
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  expect(await sheet.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("menu CRUD, confirmations, availability and dialog keyboard contracts", async ({ page, apiState }) => {
  await page.goto("/admin/menu");
  await expect(page.getByText(UNBROKEN, { exact: true }).first()).toBeVisible();

  const addCategory = page.getByRole("button", { name: "Добавить категорию" }).first();
  await addCategory.click();
  await page.getByRole("textbox", { name: "Название категории", exact: true }).fill("");
  await page.getByRole("button", { name: "Создать категорию" }).click();
  const nameInput = page.getByRole("textbox", { name: "Название категории", exact: true });
  await expect(nameInput).toHaveAttribute("aria-invalid", "true");
  await expect(nameInput).toHaveAttribute("aria-describedby", /error/);
  await nameInput.fill(`${LONG_RUSSIAN} новая`);
  await page.getByRole("button", { name: "Создать категорию" }).click();
  await expect(page.getByText(`${LONG_RUSSIAN} новая`, { exact: true })).toBeVisible();

  await expectDialogKeyboardContract(
    page,
    page.getByRole("button", { name: new RegExp(`Изменить категорию «${LONG_RUSSIAN}`) }).first(),
    /Изменить категорию/,
  );
  await expectDialogKeyboardContract(
    page,
    page.getByRole("button", { name: new RegExp(`Добавить блюдо в категорию «${LONG_RUSSIAN}`) }).first(),
    /Новое блюдо/,
  );
  const deleteCategory = page.getByRole("button", { name: new RegExp(`Удалить категорию «${LONG_RUSSIAN}`) }).first();
  await deleteCategory.click();
  const categoryAlert = page.getByRole("alertdialog", { name: /Удалить категорию/ });
  await page.keyboard.press("Shift+Tab");
  expect(await categoryAlert.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(categoryAlert).toBeHidden();
  await expect(deleteCategory).toBeFocused();

  const availability = page.getByRole("switch", { name: new RegExp(`Скрыть блюдо «${UNBROKEN}`) });
  await availability.click();
  await expect(page.getByRole("switch", { name: new RegExp(`Показать блюдо «${UNBROKEN}`) })).not.toBeChecked();
  expect(apiState.requests.some((request) => request === "PATCH /api/admin/dishes/dish-1")).toBe(true);

  const deleteDish = page.getByRole("button", { name: new RegExp(`Удалить блюдо «${UNBROKEN}`) });
  await deleteDish.click();
  const alert = page.getByRole("alertdialog", { name: /Удалить блюдо/ });
  expect(await alert.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Shift+Tab");
  expect(await alert.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(alert).toBeHidden();
  await expect(deleteDish).toBeFocused();
  await expectNoIntersections(page.locator("header button:visible"));
  await expectNoIntersections(page.locator("[data-dish-actions] > *:visible"));
  await expectNoPageOverflow(page);
});

test("table form, delete confirmation, QR and explicit horizontal scroll region", async ({ page, apiState }) => {
  await page.goto("/admin/tables");
  const scrollRegion = page.locator("[data-table-scroll-region][data-table-scroll]");
  await expect(scrollRegion).toHaveCount(1);
  await expectNoPageOverflow(page);

  const addTable = page.getByRole("button", { name: "Добавить стол" }).first();
  await expectDialogKeyboardContract(page, addTable, /Новый стол/);
  await addTable.click();
  await page.getByRole("button", { name: "Создать стол" }).click();
  const input = page.getByLabel("Номер стола");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toHaveAttribute("aria-describedby", /error/);
  await input.fill("Стол браузерного теста");
  await page.getByRole("button", { name: "Создать стол" }).click();
  await expect(page.getByText("Стол браузерного теста", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: new RegExp(`Скачать QR-код стола «${UNBROKEN}`) }).click();
  await expect.poll(() => apiState.requests.some((request) => request === "GET /api/admin/tables/table-1/qr")).toBe(true);
  const remove = page.getByRole("button", { name: new RegExp(`Удалить стол «${UNBROKEN}`) });
  await remove.click();
  const tableAlert = page.getByRole("alertdialog", { name: /Удалить стол/ });
  await expect(tableAlert).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  expect(await tableAlert.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.getByRole("button", { name: "Отмена" }).click();
  await expect(remove).toBeFocused();
});

test("statistics filters, chart fallback table, wrapping and reduced motion are accessible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/stats");
  await expect(page.getByRole("img", { name: "График выручки и прибыли" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Данные графика" })).toBeVisible();
  await expect(page.getByText(UNBROKEN, { exact: true })).toBeVisible();
  await page.getByLabel("Дата начала").fill("2026-08-10");
  await page.getByLabel("Дата окончания").fill("2026-08-01");
  await page.getByRole("button", { name: "Показать статистику" }).click();
  await expect(page.getByText("Дата окончания не может быть раньше даты начала.")).toBeVisible();
  await expect(page.getByLabel("Дата начала")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Дата окончания")).toHaveAttribute("aria-describedby", "stats-range-error");
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  const reduced = await page.locator("header button").first().evaluate((element) => {
    const value = getComputedStyle(element).transitionDuration || "0s";
    return value.split(",").map((duration) => duration.trim().endsWith("ms")
      ? Number.parseFloat(duration)
      : Number.parseFloat(duration) * 1000);
  });
  expect(Math.max(...reduced)).toBeLessThanOrEqual(1);
  await expectNoPageOverflow(page);
});

test("visible primary controls expose at least 44 by 44 CSS-pixel targets", async ({ page }) => {
  await page.goto("/admin/menu");
  const undersized = await page.locator("button:visible, a[aria-current]:visible, [role=switch]:visible").evaluateAll((elements) =>
    elements.map((element) => {
      const target = element.getAttribute("role") === "switch" ? element.parentElement ?? element : element;
      const box = target.getBoundingClientRect();
      return { name: element.getAttribute("aria-label") ?? element.textContent?.trim(), width: box.width, height: box.height };
    }).filter(({ width, height }) => width < 44 || height < 44));
  expect(undersized).toEqual([]);
});
