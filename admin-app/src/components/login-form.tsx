import { useEffect, useRef, useState } from "react";

import type { AdminApi } from "@/lib/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function LoginForm({ api, message, onSuccess }: { api: AdminApi; message?: string; onSuccess: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(message);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => setError(message), [message]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(undefined);
    try {
      const result = await api.login({ login, password });
      if (result.ok) onSuccess();
      else setError("Не удалось войти. Проверьте логин и пароль.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Не удалось выполнить вход. Попробуйте позже.");
    } finally { setPending(false); }
  }
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <form className="w-full max-w-sm space-y-6" onSubmit={submit}>
        <div><h1 className="text-2xl font-semibold">Вход в панель управления</h1><p className="text-muted-foreground">Введите данные администратора.</p></div>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <FieldGroup>
          <Field data-invalid={Boolean(error && !login)}>
            <FieldLabel htmlFor="admin-login">Логин</FieldLabel>
            <Input ref={inputRef} id="admin-login" name="login" className="min-h-11" autoComplete="username" value={login} onChange={(event) => setLogin(event.target.value)} aria-invalid={Boolean(error && !login)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="admin-password">Пароль</FieldLabel>
            <Input id="admin-password" name="password" className="min-h-11" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
        </FieldGroup>
        <Button className="min-h-11 w-full" type="submit" disabled={pending}>{pending ? "Входим…" : "Войти"}</Button>
      </form>
    </main>
  );
}
