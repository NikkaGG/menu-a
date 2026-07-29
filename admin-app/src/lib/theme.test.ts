import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  THEME_KEY,
  applyTheme,
  createThemeController,
  readTheme,
  type Theme,
} from "./theme";

function mediaQuery(matches = false) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  return {
    matches,
    addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)),
    dispatch(value: boolean) {
      this.matches = value;
      listeners.forEach((listener) => listener({ matches: value } as MediaQueryListEvent));
    },
  };
}

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
  });

  it.each<Theme>(["light", "dark", "system"])("persists the allowed %s value under admin-theme", (theme) => {
    applyTheme(theme);
    expect(localStorage.getItem(THEME_KEY)).toBe(theme);
    expect(readTheme()).toBe(theme);
  });

  it("falls back to system for an invalid stored value", () => {
    localStorage.setItem(THEME_KEY, "<script>");
    expect(readTheme()).toBe("system");
  });

  it("observes system changes only in system mode and unsubscribes", () => {
    const media = mediaQuery(false);
    const controller = createThemeController(media as unknown as MediaQueryList);
    controller.set("system");
    media.dispatch(true);
    expect(document.documentElement).toHaveClass("dark");
    controller.set("light");
    expect(media.removeEventListener).toHaveBeenCalled();
    media.dispatch(false);
    expect(document.documentElement).not.toHaveClass("dark");
    controller.destroy();
  });

  it("contains a safe pre-paint bootstrap using only allow-listed values", () => {
    const html = readFileSync(path.resolve(process.cwd(), "admin-app/index.html"), "utf8");
    expect(html).toContain("admin-theme");
    expect(html).toMatch(/light.*dark.*system/s);
    expect(html).toContain("matchMedia");
    expect(html).not.toContain("innerHTML");
    expect(html.indexOf("admin-theme")).toBeLessThan(html.indexOf('<div id="root">'));
  });
});
