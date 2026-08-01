import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { expect, test } from "../src/test/fixtures";

const pages = ["/admin/menu", "/admin/tables", "/stats"] as const;

async function expectNoAxeViolations(page: Page, context: string) {
  await page.locator("body").evaluate(async (body) => {
    await Promise.all(body.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
  });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations, `${context}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
}

test("admin pages have no axe violations in light and dark themes", async ({ page }) => {
  for (const theme of ["light", "dark"] as const) {
    await page.addInitScript((selectedTheme) => localStorage.setItem("admin-theme", selectedTheme), theme);
    for (const path of pages) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoAxeViolations(page, `${theme} ${path}`);
    }
  }
});

test("login form has no axe violations and errors are announced once", async ({ page, apiState }) => {
  apiState.authenticated = false;
  await page.goto("/admin");
  await expectNoAxeViolations(page, "login");

  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.locator('[role="alert"]')).toHaveCount(1);
  const liveMessages = await page.locator('[aria-live]:visible, [role="alert"]:visible').allTextContents();
  expect(new Set(liveMessages).size).toBe(liveMessages.length);
});

test("interactive overlays and validation states pass axe in light and dark", async ({ page, apiState }, testInfo) => {
  test.skip(testInfo.project.name !== "390px", "interactive state matrix runs at the mobile stress viewport");
  for (const theme of ["light", "dark"] as const) {
    await page.addInitScript((selectedTheme) => localStorage.setItem("admin-theme", selectedTheme), theme);
    apiState.authenticated = true;
    await page.goto("/admin/menu");

    await page.getByRole("button", { name: "Открыть меню" }).click();
    await expectNoAxeViolations(page, `${theme} mobile Sheet`);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /^Тема:/ }).click();
    await expectNoAxeViolations(page, `${theme} theme menu`);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Добавить категорию" }).first().click();
    await page.getByRole("button", { name: "Создать категорию" }).click();
    await expectNoAxeViolations(page, `${theme} category Dialog validation`);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /Добавить блюдо в категорию/ }).first().click();
    await page.getByRole("button", { name: "Создать блюдо" }).click();
    await expectNoAxeViolations(page, `${theme} dish Dialog validation`);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /Удалить категорию/ }).first().click();
    await expectNoAxeViolations(page, `${theme} category AlertDialog`);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Удалить блюдо/ }).first().click();
    await expectNoAxeViolations(page, `${theme} dish AlertDialog`);
    await page.keyboard.press("Escape");

    await page.goto("/admin/tables");
    await page.getByRole("button", { name: "Добавить стол" }).first().click();
    await page.getByRole("button", { name: "Создать стол" }).click();
    await expectNoAxeViolations(page, `${theme} table Dialog validation`);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Удалить стол/ }).first().click();
    await expectNoAxeViolations(page, `${theme} table AlertDialog`);
    await page.keyboard.press("Escape");

    await page.goto("/stats");
    await page.getByLabel("Дата начала").fill("2026-08-10");
    await page.getByLabel("Дата окончания").fill("2026-08-01");
    await page.getByRole("button", { name: "Показать статистику" }).click();
    await expectNoAxeViolations(page, `${theme} statistics validation`);

    apiState.authenticated = false;
    await page.goto("/admin");
    await page.getByRole("button", { name: "Войти" }).click();
    await expectNoAxeViolations(page, `${theme} login validation`);
  }
});
