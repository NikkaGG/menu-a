export type AdminPage = "menu" | "tables" | "stats" | "not-found";
export type AdminRoute = {
  page: AdminPage;
  canonicalPath: string;
  title: string;
  heading: string;
};

const routes: Record<string, AdminRoute> = {
  "/admin": { page: "menu", canonicalPath: "/admin/menu", title: "Управление меню — Панель управления", heading: "Управление меню" },
  "/admin/menu": { page: "menu", canonicalPath: "/admin/menu", title: "Управление меню — Панель управления", heading: "Управление меню" },
  "/admin/tables": { page: "tables", canonicalPath: "/admin/tables", title: "Столы и QR-коды — Панель управления", heading: "Столы и QR-коды" },
  "/stats": { page: "stats", canonicalPath: "/stats", title: "Статистика — Панель управления", heading: "Статистика" },
};

const aliases: Record<string, string> = {
  "/admin-next": "/admin",
  "/admin-next/menu": "/admin/menu",
  "/admin-next/tables": "/admin/tables",
  "/admin-next/stats": "/stats",
};

export function resolveRoute(pathname: string): AdminRoute {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const route = routes[aliases[normalized] ?? normalized];
  if (route) return route;
  return {
    page: "not-found",
    canonicalPath: "/admin/menu",
    title: "Страница не найдена — Панель управления",
    heading: "Страница не найдена",
  };
}

export function createRouteController(onChange: (route: AdminRoute) => void) {
  const notify = () => onChange(resolveRoute(window.location.pathname));
  const onPopState = () => notify();
  window.addEventListener("popstate", onPopState);
  return {
    navigate(path: string) {
      if (window.location.pathname !== path) window.history.pushState(null, "", path);
      notify();
    },
    destroy() { window.removeEventListener("popstate", onPopState); },
  };
}
