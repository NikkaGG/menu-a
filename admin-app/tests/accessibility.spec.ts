import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "../src/test/fixtures";

const pages = ["/admin/menu", "/admin/tables", "/stats"] as const;

test("admin pages have no axe violations in light and dark themes", async ({ page }) => {
  for (const theme of ["light", "dark"] as const) {
    await page.addInitScript((selectedTheme) => localStorage.setItem("admin-theme", selectedTheme), theme);
    for (const path of pages) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations, `${theme} ${path}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
    }
  }
});

test("login form has no axe violations and errors are announced once", async ({ page, apiState }) => {
  apiState.authenticated = false;
  await page.goto("/admin");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);

  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.locator('[role="alert"]')).toHaveCount(1);
  const liveMessages = await page.locator('[aria-live]:visible, [role="alert"]:visible').allTextContents();
  expect(new Set(liveMessages).size).toBe(liveMessages.length);
});
