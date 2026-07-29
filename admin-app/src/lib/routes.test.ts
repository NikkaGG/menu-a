import { describe, expect, it, vi } from "vitest";

import { createRouteController, resolveRoute } from "./routes";

describe("routes", () => {
  it.each([
    ["/admin", "menu", "/admin/menu"],
    ["/admin/menu", "menu", "/admin/menu"],
    ["/admin/tables", "tables", "/admin/tables"],
    ["/stats", "stats", "/stats"],
    ["/admin-next", "menu", "/admin/menu"],
    ["/admin-next/menu", "menu", "/admin/menu"],
    ["/admin-next/tables", "tables", "/admin/tables"],
    ["/admin-next/stats", "stats", "/stats"],
  ] as const)("resolves %s to %s with canonical %s", (pathname, page, canonicalPath) => {
    expect(resolveRoute(pathname)).toMatchObject({ page, canonicalPath });
  });

  it.each(["/admin/missing", "/admin-next/missing"])("returns the Russian not-found route for %s", (pathname) => {
    expect(resolveRoute(pathname)).toEqual({
      page: "not-found",
      canonicalPath: "/admin/menu",
      title: "Страница не найдена — Панель управления",
      heading: "Страница не найдена",
    });
  });

  it("reacts to push navigation and popstate, then removes listeners", () => {
    history.replaceState(null, "", "/admin/menu");
    const listener = vi.fn();
    const controller = createRouteController(listener);
    controller.navigate("/admin/tables");
    expect(location.pathname).toBe("/admin/tables");
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ page: "tables" }));
    history.replaceState(null, "", "/stats");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ page: "stats" }));
    controller.destroy();
    listener.mockClear();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(listener).not.toHaveBeenCalled();
  });
});
