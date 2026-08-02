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

async function expectMinimumTargets(scope: Locator, context: string) {
  await scope.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
  });
  const undersized = await scope.locator(
    'button:visible, nav a[href]:visible, [data-slot="sidebar-menu-button"]:visible, input[data-slot="input"]:visible, textarea[data-slot="textarea"]:visible, [role="combobox"]:visible, [role="menuitemradio"]:visible, [role="switch"]:visible',
  ).evaluateAll((elements) => elements.map((element) => {
    const id = element.getAttribute("id");
    const target = element.getAttribute("role") === "switch" && id
      ? document.querySelector<HTMLElement>(`label[for="${CSS.escape(id)}"]`) ?? element
      : element;
    const box = target.getBoundingClientRect();
    return {
      tag: element.tagName,
      role: element.getAttribute("role"),
      slot: element.getAttribute("data-slot"),
      id,
      name: element.getAttribute("aria-label") ?? element.textContent?.trim(),
      width: box.width,
      height: box.height,
    };
  }).filter(({ width, height }) => width < 44 || height < 44));
  expect(undersized, context).toEqual([]);
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
  await expectMinimumTargets(container, "open overlay targets");
}

async function expectFocusTrapCycle(page: Page, overlay: Locator) {
  const focusables = overlay.locator(
    'a[href]:visible, button:not([disabled]):visible, input:not([disabled]):visible, select:not([disabled]):visible, textarea:not([disabled]):visible, [tabindex]:not([tabindex="-1"]):visible, [contenteditable="true"]:visible',
  );
  await expect.poll(() => focusables.count()).toBeGreaterThan(1);
  const first = focusables.first();
  const last = focusables.last();
  await first.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(last).toBeFocused();
  await last.focus();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
}

async function expectOverlayKeyboardContract(page: Page, overlay: Locator, trigger?: Locator) {
  await expect(overlay).toBeVisible();
  await expectInsideViewportAndNoControlIntersections(page, overlay);
  await expectFocusTrapCycle(page, overlay);
  await page.keyboard.press("Escape");
  await expect(overlay).toBeHidden();
  if (trigger) await expect(trigger).toBeFocused();
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
  await expect(dialog).toContainText(/./);
  await expectOverlayKeyboardContract(page, dialog, trigger);
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

test("serves the built admin bundle, assets, and rejects wrong API methods", async ({ page, apiState }) => {
  const documentResponse = await page.goto("/admin");
  expect(documentResponse?.headers()["vary"]).toContain("Origin");
  const moduleSource = await page.locator('script[type="module"]').getAttribute("src");
  expect(moduleSource).toMatch(/^\/admin-dist\/assets\/index-[\w-]+\.js$/);
  await expect.poll(() => apiState.assets.map((asset) => asset.type))
    .toEqual(expect.arrayContaining(["script", "stylesheet", "font"]));
  expect(apiState.assets.length).toBeGreaterThan(0);
  for (const asset of apiState.assets) {
    expect(asset.status, asset.url).toBeGreaterThanOrEqual(200);
    expect(asset.status, asset.url).toBeLessThan(300);
    expect(new URL(asset.url).origin).toBe("http://127.0.0.1:4173");
    expect(new URL(asset.url).pathname).toMatch(/^\/admin-dist\/assets\//);
  }
  expect(apiState.failedAssets).toEqual([]);
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
  await theme.click();
  await expectMinimumTargets(page.getByRole("menu"), "theme menu targets");
  await page.keyboard.press("Escape");
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

test("failed logout keeps the shell visible and a successful retry signs out", async ({ page, apiState }) => {
  apiState.logoutFailures = 1;
  await page.goto("/admin/menu");

  const logout = page.getByRole("button", { name: "Выйти" });
  await logout.click();

  await expect(page.getByRole("alert")).toHaveText("Не удалось выйти. Попробуйте ещё раз.");
  await expect(page.getByRole("heading", { level: 1, name: "Управление меню" })).toBeVisible();
  await expect(page.getByLabel("Логин")).toHaveCount(0);
  await expect(page.getByText("secret logout failure")).toHaveCount(0);

  await logout.click();

  await expect(page.getByLabel("Логин")).toBeFocused();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("mobile sheet traps focus, closes with Escape and restores its trigger", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, "mobile navigation is hidden at this viewport");
  await page.goto("/admin");
  const trigger = page.getByRole("button", { name: "Открыть меню" });
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "Навигация" });
  await expectNoIntersections(sheet.locator("a:visible, button:visible"));
  await expectOverlayKeyboardContract(page, sheet, trigger);
});

test("dish summaries wrap inside their first cell without painting into adjacent columns", async ({ page }) => {
  await page.goto("/admin/menu");
  const rows = page.locator(".menu-dish-row:visible");
  await expect(rows).toHaveCount(1);

  const viewportWidth = page.viewportSize()?.width ?? 0;
  const violations = await rows.evaluateAll((elements, width) => elements.flatMap((row, rowIndex) => {
    const summaryCell = row.querySelector<HTMLElement>('[data-dish-cell="summary"]');
    const priceCell = row.querySelector<HTMLElement>('[data-dish-cell="price"]');
    const statusCell = row.querySelector<HTMLElement>('[data-dish-cell="status"]');
    const summary = row.querySelector<HTMLElement>('[data-dish-summary="true"]');
    const contents = [
      row.querySelector<HTMLElement>('[data-dish-name="true"]'),
      row.querySelector<HTMLElement>('[data-dish-description="true"]'),
    ].filter((element): element is HTMLElement => element !== null);
    if (!summaryCell || !priceCell || !statusCell || !summary) return [{ rowIndex, reason: "missing markers" }];

    const cellBox = summaryCell.getBoundingClientRect();
    const summaryBox = summary.getBoundingClientRect();
    const adjacentLeft = Math.min(priceCell.getBoundingClientRect().left, statusCell.getBoundingClientRect().left);
    const result: Array<Record<string, string | number | boolean>> = [];
    if (
      summaryBox.left < cellBox.left - 1
      || summaryBox.right > cellBox.right + 1
      || summary.scrollWidth > summary.clientWidth + 1
    ) {
      result.push({
        rowIndex,
        reason: "summary overflow",
        summaryRight: summaryBox.right,
        cellRight: cellBox.right,
        scrollWidth: summary.scrollWidth,
        clientWidth: summary.clientWidth,
      });
    }

    for (const content of contents) {
      const range = document.createRange();
      range.selectNodeContents(content);
      const textBox = range.getBoundingClientRect();
      const style = getComputedStyle(content);
      const paintsPastCell = textBox.left < cellBox.left - 1 || textBox.right > cellBox.right + 1;
      const paintsIntoAdjacentColumn = width >= 640 && textBox.right > adjacentLeft + 1;
      if (
        style.whiteSpace === "nowrap"
        || content.scrollWidth > content.clientWidth + 1
        || paintsPastCell
        || paintsIntoAdjacentColumn
      ) {
        result.push({
          rowIndex,
          reason: content.dataset.dishName ? "name overflow" : "description overflow",
          whiteSpace: style.whiteSpace,
          textRight: textBox.right,
          cellRight: cellBox.right,
          adjacentLeft,
          scrollWidth: content.scrollWidth,
          clientWidth: content.clientWidth,
          paintsPastCell,
          paintsIntoAdjacentColumn,
        });
      }
    }
    return result;
  }), viewportWidth);

  expect(violations).toEqual([]);
});

test("menu CRUD, confirmations, availability and dialog keyboard contracts", async ({ page, apiState }) => {
  await page.goto("/admin/menu");
  await expect(page.locator("[data-table-scroll]")).toHaveCount(0);
  await expect(page.getByText(UNBROKEN, { exact: true }).first()).toBeVisible();

  const addCategory = page.getByRole("button", { name: "Добавить категорию" }).first();
  await expectDialogKeyboardContract(page, addCategory, /Новая категория/);
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
    page.getByRole("button", { name: `Изменить категорию «${LONG_RUSSIAN}»` }),
    /Изменить категорию/,
  );
  await page.getByRole("button", { name: `Изменить категорию «${LONG_RUSSIAN}»` }).click();
  await page.getByRole("textbox", { name: "Название категории", exact: true }).fill(`${LONG_RUSSIAN} изменена`);
  await page.getByRole("button", { name: "Сохранить категорию" }).click();
  await expect(page.getByText(`${LONG_RUSSIAN} изменена`, { exact: true })).toBeVisible();
  expect(apiState.calls).toContainEqual(expect.objectContaining({
    method: "PATCH",
    path: "/api/admin/categories/category-1",
    body: { name: `${LONG_RUSSIAN} изменена`, sort_order: 1 },
  }));
  await expect(page.getByText("Категория обновлена.", { exact: true })).toBeVisible();

  await expectDialogKeyboardContract(
    page,
    page.getByRole("button", { name: `Добавить блюдо в категорию «${LONG_RUSSIAN} изменена»` }),
    /Новое блюдо/,
  );
  await page.getByRole("button", { name: `Добавить блюдо в категорию «${LONG_RUSSIAN} изменена»` }).click();
  await page.getByLabel("Название блюда").fill("Блюдо браузерного теста");
  await page.getByLabel("Цена").fill("4500.50");
  await page.getByRole("button", { name: "Создать блюдо" }).click();
  await expect(page.getByText("Блюдо браузерного теста", { exact: true })).toBeVisible();
  expect(apiState.calls).toContainEqual(expect.objectContaining({
    method: "POST",
    path: "/api/admin/dishes",
    body: expect.objectContaining({
      category_id: "category-1",
      name: "Блюдо браузерного теста",
      price: 4500.5,
      is_available: true,
    }),
  }));
  await expect(page.getByText("Блюдо создано.", { exact: true })).toBeVisible();

  const editCreatedDish = page.getByRole("button", { name: "Изменить блюдо «Блюдо браузерного теста»" });
  await expectDialogKeyboardContract(page, editCreatedDish, /Изменить блюдо/);
  await editCreatedDish.click();
  await page.getByLabel("Название блюда").fill("Блюдо браузерного теста изменено");
  await page.getByRole("button", { name: "Сохранить блюдо" }).click();
  await expect(page.getByText("Блюдо браузерного теста изменено", { exact: true })).toBeVisible();
  expect(apiState.calls).toContainEqual(expect.objectContaining({
    method: "PATCH",
    path: "/api/admin/dishes/dish-2",
    body: expect.objectContaining({ name: "Блюдо браузерного теста изменено", price: 4500.5 }),
  }));
  await expect(page.getByText("Блюдо обновлено.", { exact: true })).toBeVisible();

  const deleteCategory = page.getByRole("button", { name: new RegExp(`Удалить категорию «${LONG_RUSSIAN} новая`) });
  await deleteCategory.click();
  const categoryAlert = page.getByRole("alertdialog", { name: /Удалить категорию/ });
  await expectOverlayKeyboardContract(page, categoryAlert, deleteCategory);
  await deleteCategory.click();
  await page.getByRole("button", { name: "Удалить категорию" }).click();
  await expect(page.getByText(`${LONG_RUSSIAN} новая`, { exact: true })).toBeHidden();
  expect(apiState.calls).toContainEqual(expect.objectContaining({
    method: "DELETE",
    path: "/api/admin/categories/category-2",
    body: null,
  }));
  await expect(page.getByText("Категория удалена.", { exact: true })).toBeVisible();

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
  await expectOverlayKeyboardContract(page, alert, deleteDish);
  const deleteCreatedDish = page.getByRole("button", { name: "Удалить блюдо «Блюдо браузерного теста изменено»" });
  await deleteCreatedDish.click();
  await page.getByRole("button", { name: "Удалить блюдо" }).click();
  await expect(page.getByText("Блюдо браузерного теста изменено", { exact: true })).toBeHidden();
  expect(apiState.calls).toContainEqual(expect.objectContaining({
    method: "DELETE",
    path: "/api/admin/dishes/dish-2",
    body: null,
  }));
  await expect(page.getByText("Блюдо удалено.", { exact: true })).toBeVisible();
  await expectNoIntersections(page.locator("header button:visible"));
  await expect(page.locator("[data-category-actions]")).toHaveCount(1);
  await expectNoIntersections(page.locator("[data-category-actions] > *:visible"));
  await expectNoIntersections(page.locator("[data-dish-actions] > *:visible"));
  await expectNoIntersections(page.locator("[data-menu-page] > div:first-of-type button:visible"));
  await expectNoPageOverflow(page);
});

test("table form, responsive cards, delete confirmation and QR download", async ({ page, apiState }) => {
  await page.goto("/admin/tables");
  const scrollRegion = page.locator("[data-table-scroll-region][data-table-scroll]");
  const table = page.getByRole("table", { name: "Столы и QR-коды" });
  const tableHeader = table.locator("thead");
  const rows = table.locator("[data-table-card-row]");
  const numberCell = rows.first().locator("[data-table-number]");
  const createdCell = rows.first().locator("[data-table-created]");
  const numberLabel = numberCell.getByText("Стол", { exact: true });
  const createdLabel = createdCell.getByText("Создан", { exact: true });
  const createdValue = createdCell.locator("span").last();
  const viewportWidth = page.viewportSize()?.width ?? 0;
  await expect(scrollRegion).toHaveCount(1);
  await expect(page.locator("[data-table-scroll]")).toHaveCount(1);
  await expect(scrollRegion).toHaveAttribute("tabindex", "0");
  await expect(scrollRegion).toHaveAttribute("aria-label", "Таблица столов");
  await expect(table).toBeVisible();
  await expect(table.getByRole("row", { includeHidden: true })).toHaveCount(2);
  await expect(table.getByRole("columnheader", { includeHidden: true })).toHaveCount(3);
  await expect(table.getByRole("cell")).toHaveCount(3);
  for (const [cell, headingId, headingText] of [
    [numberCell, "tables-number-heading", "Стол"],
    [createdCell, "tables-created-heading", "Создан"],
    [rows.first().locator("[data-table-actions]"), "tables-actions-heading", "Действия"],
  ] as const) {
    await expect(table.locator(`#${headingId}`)).toHaveText(headingText);
    await expect(cell).toHaveAttribute("headers", headingId);
    await expect(cell).not.toHaveAttribute("aria-labelledby", /.+/);
  }
  await expect(numberLabel).toHaveAttribute("aria-hidden", "true");
  await expect(createdLabel).toHaveAttribute("aria-hidden", "true");
  await expect(rows).toHaveCount(1);
  await expect(numberCell).toContainText(UNBROKEN);

  if (viewportWidth < 768) {
    const lastCardBorders = await rows.last().evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        top: style.borderTopWidth,
        right: style.borderRightWidth,
        bottom: style.borderBottomWidth,
        left: style.borderLeftWidth,
      };
    });
    expect(lastCardBorders).toEqual({ top: "1px", right: "1px", bottom: "1px", left: "1px" });
    const sizes = await scrollRegion.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth + 1);
    const headerStyle = await tableHeader.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        position: style.position,
        width: style.width,
        height: style.height,
        overflow: style.overflow,
        whiteSpace: style.whiteSpace,
        clipPath: style.clipPath,
      };
    });
    expect(headerStyle).toEqual({
      position: "absolute",
      width: "1px",
      height: "1px",
      overflow: "hidden",
      whiteSpace: "nowrap",
      clipPath: "inset(50%)",
    });
    await expect(createdCell).toHaveCSS("text-align", "right");
    await expect(rows.first().getByRole("button", { name: new RegExp(`Скачать QR-код стола «${UNBROKEN}`) })).toBeVisible();
    await expect(rows.first().getByRole("button", { name: new RegExp(`Удалить стол «${UNBROKEN}`) })).toBeVisible();
    await expect(numberLabel).toBeVisible();
    await expect(createdLabel).toBeVisible();
    for (const label of [numberLabel, createdLabel]) {
      await expect(label).toHaveCSS("display", "block");
      await expect(label).toHaveCSS("font-size", "12px");
      const box = await label.boundingBox();
      expect(box?.width).toBeGreaterThan(1);
      expect(box?.height).toBeGreaterThan(1);
    }
    const expectedCreated = await page.evaluate(() => new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date("2026-07-29T10:00:00.000Z")));
    await expect(createdValue).toHaveText(expectedCreated);
    const createdValueSize = await createdValue.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(createdValueSize.scrollWidth).toBeLessThanOrEqual(createdValueSize.clientWidth);
  } else {
    const headerMetrics = await tableHeader.evaluate((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        position: style.position,
        display: style.display,
        overflow: style.overflow,
        whiteSpace: style.whiteSpace,
        width: box.width,
        height: box.height,
      };
    });
    expect(headerMetrics.position).toBe("static");
    expect(headerMetrics.display).toBe("table-header-group");
    expect(headerMetrics.overflow).toBe("visible");
    expect(headerMetrics.whiteSpace).toBe("normal");
    expect(headerMetrics.width).toBeGreaterThan(1);
    expect(headerMetrics.height).toBeGreaterThan(1);
    await expect(table.getByRole("columnheader", { name: "Стол" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Создан" })).toBeVisible();
    await expect(numberLabel).toBeHidden();
    await expect(createdLabel).toBeHidden();
    await expect(rows.first()).toHaveCSS("display", "table-row");
    const rowBorders = await rows.first().evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        top: style.borderTopWidth,
        right: style.borderRightWidth,
        bottom: style.borderBottomWidth,
        left: style.borderLeftWidth,
      };
    });
    expect(await numberCell.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(257);
    expect(rowBorders).toEqual({ top: "0px", right: "0px", bottom: "1px", left: "0px" });
    await expect(createdCell).toHaveCSS("text-align", "left");
    await expect(numberCell).toHaveCSS("max-width", "256px");
    const containment = await scrollRegion.evaluate((element) => ({
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      viewport: document.documentElement.clientWidth,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(containment.left).toBeGreaterThanOrEqual(-1);
    expect(containment.right).toBeLessThanOrEqual(containment.viewport + 1);
    expect(containment.scrollWidth).toBeGreaterThanOrEqual(containment.clientWidth);
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
  await expect(rows).toHaveCount(2);
  await expectNoIntersections(rows);
  await expectNoIntersections(rows.locator("button:visible"));
  if (viewportWidth < 768) {
    const geometry = await rows.evaluateAll((elements) => elements.map((row) => {
      const rowBox = row.getBoundingClientRect();
      const visibleContents = [...row.querySelectorAll<HTMLElement>("*")].filter((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0;
      });
      return {
        row: { left: rowBox.left, right: rowBox.right, top: rowBox.top, bottom: rowBox.bottom },
        contents: visibleContents.map((element) => {
          const box = element.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
        }),
        viewport: document.documentElement.clientWidth,
      };
    }));
    for (const card of geometry) {
      expect(card.row.left).toBeGreaterThanOrEqual(-1);
      expect(card.row.right).toBeLessThanOrEqual(card.viewport + 1);
      for (const content of card.contents) {
        expect(content.left).toBeGreaterThanOrEqual(card.row.left - 1);
        expect(content.right).toBeLessThanOrEqual(card.row.right + 1);
        expect(content.top).toBeGreaterThanOrEqual(card.row.top - 1);
        expect(content.bottom).toBeLessThanOrEqual(card.row.bottom + 1);
        expect(content.left).toBeGreaterThanOrEqual(-1);
        expect(content.right).toBeLessThanOrEqual(card.viewport + 1);
      }
    }
    for (const row of await rows.all()) {
      await expect(row.getByRole("button", { name: /Скачать QR-код стола/ })).toHaveCount(1);
      await expect(row.getByRole("button", { name: /Удалить стол/ })).toHaveCount(1);
      await expectMinimumTargets(row, "table card action targets");
    }
  }

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: new RegExp(`Скачать QR-код стола «${UNBROKEN}`) }).click();
  const qrDownload = await downloadPromise;
  expect(qrDownload.suggestedFilename()).toBe("table-qr.png");
  const qrStream = await qrDownload.createReadStream();
  const qrChunks: Buffer[] = [];
  for await (const chunk of qrStream) qrChunks.push(Buffer.from(chunk));
  expect(Buffer.concat(qrChunks).subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  await expect.poll(() => apiState.requests.some((request) => request === "GET /api/admin/tables/table-1/qr")).toBe(true);
  const remove = page.getByRole("button", { name: new RegExp(`Удалить стол «${UNBROKEN}`) });
  await remove.click();
  const tableAlert = page.getByRole("alertdialog", { name: /Удалить стол/ });
  await expectOverlayKeyboardContract(page, tableAlert, remove);
  await remove.click();
  await page.getByRole("button", { name: "Удалить стол" }).click();
  await expect(page.getByText(UNBROKEN, { exact: true })).toBeHidden();
  expect(apiState.calls).toContainEqual(expect.objectContaining({
    method: "DELETE",
    path: "/api/admin/tables/table-1",
    body: null,
  }));
  await expect(page.getByText("Стол удалён.", { exact: true })).toBeVisible();
});

test("statistics metrics, responsive chart disclosure and reduced motion are accessible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/stats");

  const kpis = page.locator("[data-stats-kpis]");
  await expect(kpis).toBeVisible();
  const revenueCard = page.locator('[data-slot="card"]').filter({
    has: page.getByText("Общая выручка", { exact: true }),
  });
  const orderCountCard = page.locator('[data-slot="card"]').filter({
    has: page.getByText("Количество заказов", { exact: true }),
  });
  const averageCheckCard = page.locator('[data-slot="card"]').filter({
    has: page.getByText("Средний чек", { exact: true }),
  });
  const profitCard = page.locator('[data-slot="card"]').filter({
    has: page.getByText("Общая прибыль", { exact: true }),
  });
  await expect(revenueCard.locator("p")).toHaveText(/123[\s\u00a0\u202f]?456,78\s*₸/);
  await expect(orderCountCard).toContainText("Количество заказов");
  await expect(orderCountCard.locator("p")).toHaveText("42");
  await expect(averageCheckCard).toContainText("Средний чек");
  await expect(averageCheckCard.locator("p")).toHaveText(/2[\s\u00a0\u202f]?939,45\s*₸/);
  await expect(profitCard.locator("p")).toHaveText(/45[\s\u00a0\u202f]?678,90\s*₸/);

  const viewportWidth = page.viewportSize()?.width ?? 0;
  const expectedColumns = viewportWidth < 640 ? 1 : viewportWidth >= 1440 ? 4 : 2;
  const rowSizes = await kpis.locator(":scope > *").evaluateAll((cards) => {
    const rows: number[][] = [];
    for (const card of cards) {
      const top = card.getBoundingClientRect().top;
      const row = rows.find((entry) => Math.abs(entry[0] - top) <= 1);
      if (row) row.push(top);
      else rows.push([top]);
    }
    return rows.map((row) => row.length);
  });
  expect(rowSizes).toEqual(Array.from({ length: 4 / expectedColumns }, () => expectedColumns));

  await expect(page.getByRole("img", { name: "График выручки и прибыли" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Данные графика" })).toBeVisible();
  const chart = page.locator('[data-slot="chart"]');
  const chartHeight = await chart.evaluate((element) => element.getBoundingClientRect().height);
  expect(chartHeight).toBeGreaterThanOrEqual(250);
  expect(chartHeight).toBeLessThanOrEqual(320);

  const collapse = page.getByTestId("statistics-chart-collapse");
  const region = page.locator("#statistics-chart-region");
  const toggle = page.getByRole("button", { name: "Свернуть график" });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const toggleBox = await toggle.boundingBox();
  expect(toggleBox).not.toBeNull();
  expect(toggleBox!.width).toBeGreaterThanOrEqual(44);
  expect(toggleBox!.height).toBeGreaterThanOrEqual(44);
  await expect(region).toHaveAttribute("aria-hidden", "false");
  await expect(region).not.toHaveAttribute("inert");

  const statsScroll = page.locator('[data-table-scroll][aria-label="Таблица данных графика"]');
  await expect(statsScroll).toHaveCount(1);
  await expect(statsScroll).toHaveAttribute("tabindex", "0");
  if (viewportWidth <= 390) {
    const sizes = await statsScroll.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(sizes.scrollWidth).toBeGreaterThan(sizes.clientWidth);
  }
  await expect(page.getByText(UNBROKEN, { exact: true })).toBeVisible();
  const statsPage = page.locator("[data-stats-page]");
  await expectNoIntersections(statsPage.locator('form button:visible, form input:visible, form [role="combobox"]:visible'));
  await expectNoIntersections(page.locator("[data-stats-kpis] > *:visible"));
  await expectNoIntersections(statsScroll.locator("tbody tr:visible"));
  await expectNoIntersections(statsScroll.locator("th:visible, td:visible"));
  await expectNoIntersections(statsPage.locator("button:visible"));

  const expandedCollapseHeight = await collapse.evaluate((element) => element.getBoundingClientRect().height);
  const expandedTableTop = await statsScroll.evaluate((element) => element.getBoundingClientRect().top);
  const reducedDurations = await collapse.evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(reducedDurations.split(",").every((duration) => Number.parseFloat(duration) <= 0.001)).toBe(true);

  await toggle.click();
  const expandToggle = page.getByRole("button", { name: "Развернуть график" });
  await expect(expandToggle).toHaveAttribute("aria-expanded", "false");
  await expect(region).toHaveAttribute("aria-hidden", "true");
  await expect(region).toHaveAttribute("inert", "");
  await expect(page.getByRole("img", { name: "График выручки и прибыли" })).toHaveCount(0);
  await expect.poll(() => collapse.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(1);
  const collapsedTableTop = await statsScroll.evaluate((element) => element.getBoundingClientRect().top);
  expect(collapsedTableTop).toBeLessThan(expandedTableTop - expandedCollapseHeight / 2);
  const collapsedGap = await statsScroll.evaluate((table) => {
    const chartCard = document.querySelector('[data-testid="statistics-chart-collapse"]')?.closest('[data-slot="card"]');
    const tableCard = table.closest('[data-slot="card"]');
    return chartCard && tableCard
      ? tableCard.getBoundingClientRect().top - chartCard.getBoundingClientRect().bottom
      : Number.POSITIVE_INFINITY;
  });
  expect(collapsedGap).toBeLessThanOrEqual(20);
  await expectNoPageOverflow(page);

  await expandToggle.click();
  await expect(page.getByRole("button", { name: "Свернуть график" })).toHaveAttribute("aria-expanded", "true");
  await expect(region).toHaveAttribute("aria-hidden", "false");
  await expect(region).not.toHaveAttribute("inert");
  await expect(page.getByRole("img", { name: "График выручки и прибыли" })).toBeVisible();
  await expect.poll(() => collapse.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(250);

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

test("statistics chart collapse animates for normal motion", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "1440px", "normal-motion animation runs once at the controlled wide viewport");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/stats");

  const collapse = page.getByTestId("statistics-chart-collapse");
  const toggle = page.getByRole("button", { name: "Свернуть график" });
  await expect(collapse).toBeVisible();
  const transition = await collapse.evaluate((element) => {
    const style = getComputedStyle(element);
    const toMilliseconds = (duration: string) => duration.endsWith("ms")
      ? Number.parseFloat(duration)
      : Number.parseFloat(duration) * 1000;
    return {
      properties: style.transitionProperty.split(",").map((property) => property.trim()),
      durations: style.transitionDuration.split(",").map((duration) => toMilliseconds(duration.trim())),
    };
  });
  expect(transition.properties).toEqual(expect.arrayContaining(["grid-template-rows", "opacity"]));
  for (const duration of transition.durations) {
    expect(duration).toBeGreaterThanOrEqual(250);
    expect(duration).toBeLessThanOrEqual(350);
  }

  const expandedHeight = await collapse.evaluate((element) => element.getBoundingClientRect().height);
  expect(expandedHeight).toBeGreaterThanOrEqual(250);
  await toggle.click();
  await collapse.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await expect.poll(async () => {
    await collapse.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    const height = await collapse.evaluate((element) => element.getBoundingClientRect().height);
    return height > 1 && height < expandedHeight - 1;
  }, { intervals: [10, 10, 10, 10, 10, 10, 10, 10] }).toBe(true);
  await expect.poll(() => collapse.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(1);
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

test("login, navigation, pages, forms and switch labels expose 44 by 44 targets", async ({ page, apiState }) => {
  apiState.authenticated = false;
  await page.goto("/admin");
  await expectMinimumTargets(page.locator("body"), "login targets");

  apiState.authenticated = true;
  for (const path of ["/admin/menu", "/admin/tables", "/stats"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectMinimumTargets(page.locator("body"), `${path} targets`);
  }
});
