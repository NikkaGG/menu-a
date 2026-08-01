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

async function expectInsideViewportAndNoControlIntersections(page: Page, container: Locator) {
  await container.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
  });
  const box = await container.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
  await expectNoIntersections(container.locator("button:visible, input:visible, textarea:visible, [role=switch]:visible"));
}

async function expectReducedMotion(page: Page, scope: Locator = page.locator("body")) {
  const offenders = await scope.locator("*:visible").evaluateAll((elements) => {
    const milliseconds = (value: string) => value.split(",").map((item) => {
      const duration = item.trim();
      return duration.endsWith("ms") ? Number.parseFloat(duration) : Number.parseFloat(duration) * 1000;
    });
    return elements.flatMap((element) => {
      const style = getComputedStyle(element);
      const longest = Math.max(...milliseconds(style.transitionDuration), ...milliseconds(style.animationDuration));
      return longest > 1 ? [{ tag: element.tagName, slot: element.getAttribute("data-slot"), longest }] : [];
    });
  });
  expect(offenders).toEqual([]);
}

async function expectDialogKeyboardContract(page: Page, trigger: Locator, name: RegExp) {
  await trigger.focus();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name });
  await expect(dialog).toBeVisible();
  await expectInsideViewportAndNoControlIntersections(page, dialog);
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

  await page.goto("/admin/неизвестно");
  await expect(page).toHaveTitle("Страница не найдена — Панель управления");
  await expect(page.getByRole("heading", { level: 1, name: "Страница не найдена" })).toBeFocused();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "http://127.0.0.1:4173/admin/menu");
  await page.getByRole("link", { name: "Перейти к управлению меню" }).click();
  await expect(page).toHaveURL(/\/admin\/menu$/);
});

test("serves the built admin bundle and rejects wrong API methods", async ({ page }) => {
  await page.goto("/admin");
  const moduleSource = await page.locator('script[type="module"]').getAttribute("src");
  expect(moduleSource).toMatch(/^\/admin-dist\/assets\/index-[\w-]+\.js$/);
  const statuses = await page.evaluate(async () => Promise.all([
    fetch("/api/admin/session", { method: "POST" }).then((response) => response.status),
    fetch("/api/admin/logout", { method: "GET" }).then((response) => response.status),
    fetch("/api/admin/stats", { method: "POST" }).then((response) => response.status),
  ]));
  expect(statuses).toEqual([405, 405, 405]);
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
    const item = page.getByRole("menuitemradio", { name: choice });
    await item.focus();
    await page.keyboard.press("Enter");
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
  await expectInsideViewportAndNoControlIntersections(page, sheet);
  await expectNoIntersections(sheet.locator("a:visible, button:visible"));
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
  await expectInsideViewportAndNoControlIntersections(page, categoryAlert);
  await page.keyboard.press("Shift+Tab");
  expect(await categoryAlert.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(categoryAlert).toBeHidden();
  await expect(deleteCategory).toBeFocused();

  const availability = page.getByRole("switch", { name: new RegExp(`Скрыть блюдо «${UNBROKEN}`) });
  const availabilityId = await availability.getAttribute("id");
  expect(availabilityId).toBeTruthy();
  const availabilityTarget = page.locator(`label[for="${availabilityId}"]`);
  await expect(availabilityTarget).toBeVisible();
  const targetBox = await availabilityTarget.boundingBox();
  expect(targetBox!.width).toBeGreaterThanOrEqual(44);
  expect(targetBox!.height).toBeGreaterThanOrEqual(44);
  await availabilityTarget.click();
  await expect(page.getByRole("switch", { name: new RegExp(`Показать блюдо «${UNBROKEN}`) })).not.toBeChecked();
  expect(apiState.requests.some((request) => request === "PATCH /api/admin/dishes/dish-1")).toBe(true);

  const deleteDish = page.getByRole("button", { name: new RegExp(`Удалить блюдо «${UNBROKEN}`) });
  await deleteDish.click();
  const alert = page.getByRole("alertdialog", { name: /Удалить блюдо/ });
  await expectInsideViewportAndNoControlIntersections(page, alert);
  expect(await alert.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Shift+Tab");
  expect(await alert.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(alert).toBeHidden();
  await expect(deleteDish).toBeFocused();
  await expectNoIntersections(page.locator("header button:visible"));
  await expect(page.locator("[data-category-actions]")).toHaveCount(2);
  await expectNoIntersections(page.locator("[data-category-actions] > *:visible"));
  await expectNoIntersections(page.locator("[data-dish-actions] > *:visible"));
  await expectNoIntersections(page.locator("[data-menu-page] > div:first-of-type button:visible"));
  await expectNoPageOverflow(page);
});

test("table form, delete confirmation, QR and explicit horizontal scroll region", async ({ page, apiState }) => {
  await page.goto("/admin/tables");
  const scrollRegion = page.locator("[data-table-scroll-region][data-table-scroll]");
  await expect(scrollRegion).toHaveCount(1);
  await expect(page.locator("[data-table-scroll]")).toHaveCount(1);
  await expect(scrollRegion).toHaveAttribute("tabindex", "0");
  await expect(scrollRegion).toHaveAttribute("aria-label", "Таблица столов");
  if ((page.viewportSize()?.width ?? 0) <= 390) {
    const before = await scrollRegion.evaluate((element) => ({
      left: element.scrollLeft,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(before.scrollWidth).toBeGreaterThan(before.clientWidth);
    await scrollRegion.focus();
    await scrollRegion.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    await expect.poll(() => scrollRegion.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before.left);
  }
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
  await expectInsideViewportAndNoControlIntersections(page, tableAlert);
  await page.keyboard.press("Shift+Tab");
  expect(await tableAlert.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(tableAlert).toBeHidden();
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
  await expectReducedMotion(page);
  await expectNoPageOverflow(page);
});

test("reduced motion applies to the page and open overlays", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/admin/menu");
  await expectReducedMotion(page);
  if ((page.viewportSize()?.width ?? 0) < 768) {
    await page.getByRole("button", { name: "Открыть меню" }).click();
    await expectReducedMotion(page, page.getByRole("dialog", { name: "Навигация" }));
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Добавить категорию" }).first().click();
  await expectReducedMotion(page, page.getByRole("dialog", { name: "Новая категория" }));
});

test("visible primary controls expose at least 44 by 44 real targets", async ({ page }) => {
  await page.goto("/admin/menu");
  const undersized = await page.locator("button:visible, a[aria-current]:visible, [role=switch]:visible").evaluateAll((elements) =>
    elements.map((element) => {
      const id = element.getAttribute("id");
      const target = element.getAttribute("role") === "switch" && id
        ? document.querySelector<HTMLElement>(`label[for="${CSS.escape(id)}"]`) ?? element
        : element;
      const box = target.getBoundingClientRect();
      return { name: element.getAttribute("aria-label") ?? element.textContent?.trim(), width: box.width, height: box.height };
    }).filter(({ width, height }) => width < 44 || height < 44));
  expect(undersized).toEqual([]);
});
