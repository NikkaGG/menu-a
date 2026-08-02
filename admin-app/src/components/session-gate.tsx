import { useCallback, useEffect, useState } from "react";

import type { AdminApi } from "@/lib/api";
import { LoginForm } from "./login-form";

type SessionContext = {
  logout: () => Promise<void>;
  logoutError?: string;
};
const generations = new WeakMap<object, number>();
const nextGeneration = (api: AdminApi) => {
  const next = (generations.get(api) ?? 0) + 1;
  generations.set(api, next);
  return next;
};
const currentGeneration = (api: AdminApi) => generations.get(api) ?? 0;

export function SessionGate({
  api,
  children,
  registerUnauthorized,
}: {
  api: AdminApi;
  children: (context: SessionContext) => React.ReactNode;
  registerUnauthorized?: (handler: () => void) => void;
}) {
  const [state, setState] = useState<"loading" | "login" | "authenticated">("loading");
  const [message, setMessage] = useState<string>();
  const [logoutError, setLogoutError] = useState<string>();
  const unauthorize = useCallback(() => {
    nextGeneration(api);
    setMessage(undefined);
    setLogoutError(undefined);
    setState("login");
  }, [api]);
  useEffect(() => registerUnauthorized?.(unauthorize), [registerUnauthorized, unauthorize]);
  useEffect(() => {
    const request = nextGeneration(api);
    api.session().then(
      (session) => { if (request === currentGeneration(api)) setState(session.authenticated ? "authenticated" : "login"); },
      () => {
        if (request === currentGeneration(api)) {
          setMessage("Не удалось проверить сессию. Войдите снова.");
          setState("login");
        }
      },
    );
    return () => { nextGeneration(api); };
  }, [api]);
  const logout = useCallback(async () => {
    const request = nextGeneration(api);
    setLogoutError(undefined);
    try {
      await api.logout();
      if (request === currentGeneration(api)) unauthorize();
    } catch {
      if (request === currentGeneration(api)) {
        setLogoutError("Не удалось выйти. Попробуйте ещё раз.");
      }
    }
  }, [api, unauthorize]);
  if (state === "loading") return <main className="grid min-h-svh place-items-center" aria-live="polite">Проверяем сессию…</main>;
  if (state === "login") return <LoginForm api={api} message={message} onSuccess={() => { nextGeneration(api); setMessage(undefined); setState("authenticated"); }} />;
  return <>{children({ logout, logoutError })}</>;
}
