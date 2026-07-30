import { useEffect, useRef, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { SessionGate } from "@/components/session-gate";
import { MenuPage } from "@/features/menu/menu-page";
import { createAdminApi } from "@/lib/api";
import { createRouteController, resolveRoute, type AdminRoute } from "@/lib/routes";

const unauthorizedHandlers = new WeakMap<object, () => void>();

export default function App() {
  const [route, setRoute] = useState<AdminRoute>(() => resolveRoute(window.location.pathname));
  const [authKey] = useState(() => ({}));
  const [api] = useState(() => createAdminApi({ onUnauthorized: () => unauthorizedHandlers.get(authKey)?.() }));
  const controller = useRef<ReturnType<typeof createRouteController> | null>(null);
  useEffect(() => {
    controller.current = createRouteController(setRoute);
    return () => controller.current?.destroy();
  }, []);
  useEffect(() => {
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.append(canonical);
    }
    canonical.href = new URL(route.canonicalPath, window.location.origin).href;
  }, [route]);
  const body = route.page === "menu"
    ? <MenuPage api={api} />
    : route.page === "tables"
      ? <p className="text-muted-foreground">Здесь будет управление столами и QR-кодами.</p>
      : route.page === "stats"
        ? <p className="text-muted-foreground">Здесь будет статистика заказов.</p>
        : <p>Запрошенная страница не существует. <a className="underline" href="/admin/menu" onClick={(event) => { event.preventDefault(); controller.current?.navigate("/admin/menu"); }}>Перейти к управлению меню</a></p>;
  return (
    <div data-admin-app>
      <SessionGate api={api} registerUnauthorized={(handler) => { unauthorizedHandlers.set(authKey, handler); }}>
        {({ logout }) => (
          <AdminShell route={route} onNavigate={(path) => controller.current?.navigate(path)} onLogout={logout}>
            {body}
          </AdminShell>
        )}
      </SessionGate>
    </div>
  );
}
