import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AdminApi } from "@/lib/api";
import { AdminApiError } from "@/lib/api";

import { SessionGate } from "./session-gate";

function api(overrides: Partial<AdminApi> = {}): AdminApi {
  return {
    session: vi.fn(async () => ({ authenticated: false })),
    login: vi.fn(async () => ({ ok: true })),
    logout: vi.fn(async () => undefined),
    categories: {} as AdminApi["categories"],
    dishes: {} as AdminApi["dishes"],
    tables: {} as AdminApi["tables"],
    stats: vi.fn(),
    ...overrides,
  };
}

describe("SessionGate", () => {
  it("shows loading then focuses the login for unauthenticated bootstrap", async () => {
    render(<SessionGate api={api()}>{() => <div>Оболочка</div>}</SessionGate>);
    expect(screen.getByText("Проверяем сессию…")).toBeInTheDocument();
    const login = await screen.findByLabelText("Логин");
    expect(login).toHaveFocus();
  });

  it("renders authenticated content after bootstrap", async () => {
    render(
      <SessionGate api={api({ session: vi.fn(async () => ({ authenticated: true })) })}>
        {() => <div>Оболочка</div>}
      </SessionGate>,
    );
    expect(await screen.findByText("Оболочка")).toBeInTheDocument();
  });

  it("safely converts bootstrap errors to one login error", async () => {
    render(
      <SessionGate api={api({ session: vi.fn(async () => { throw new Error("secret"); }) })}>
        {() => <div>Оболочка</div>}
      </SessionGate>,
    );
    expect(await screen.findByText("Не удалось проверить сессию. Войдите снова.")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("prevents duplicate login submits and preserves localized API errors", async () => {
    let reject!: (error: Error) => void;
    const login = vi.fn(() => new Promise<never>((_resolve, rejectPromise) => { reject = rejectPromise; }));
    render(<SessionGate api={api({ login })}>{() => <div>Оболочка</div>}</SessionGate>);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Логин"), "admin");
    await user.type(screen.getByLabelText("Пароль"), "wrong");
    const submit = screen.getByRole("button", { name: "Войти" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(login).toHaveBeenCalledTimes(1);
    await act(async () => reject(new AdminApiError("Слишком много попыток. Попробуйте позже.", { status: 429 })));
    expect(await screen.findByText("Слишком много попыток. Попробуйте позже.")).toBeInTheDocument();
    expect(screen.getByLabelText("Логин")).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByLabelText("Пароль")).toHaveAttribute("aria-invalid", "false");
  });

  it("connects a general credential error to both invalid fields with a stable id", async () => {
    render(
      <SessionGate api={api({ login: vi.fn(async () => ({ ok: false })) })}>
        {() => <div>Оболочка</div>}
      </SessionGate>,
    );
    const user = userEvent.setup();
    const login = await screen.findByLabelText("Логин");
    const password = screen.getByLabelText("Пароль");
    await user.type(login, "admin");
    await user.type(password, "wrong");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    const error = await screen.findByText("Не удалось войти. Проверьте логин и пароль.");
    expect(error).toHaveAttribute("id", "admin-login-error");
    for (const field of [login, password]) {
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveAttribute("aria-describedby", "admin-login-error");
      expect(field).toHaveAttribute("aria-errormessage", "admin-login-error");
      expect(field.closest('[data-slot="field"]')).toHaveAttribute("data-invalid", "true");
    }
  });

  it("logs in, logs out, and quietly handles idempotent expiry", async () => {
    const client = api();
    let expire!: () => void;
    render(
      <SessionGate api={client} registerUnauthorized={(handler) => { expire = handler; }}>
        {({ logout }) => <button onClick={logout}>Выйти</button>}
      </SessionGate>,
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Логин"), "admin");
    await user.type(screen.getByLabelText("Пароль"), "secret");
    await user.click(screen.getByRole("button", { name: "Войти" }));
    await user.click(await screen.findByRole("button", { name: "Выйти" }));
    await waitFor(() => expect(client.logout).toHaveBeenCalledTimes(1));
    expect(await screen.findByLabelText("Логин")).toHaveFocus();
    act(() => { expire(); expire(); });
    expect(screen.getAllByLabelText("Логин")).toHaveLength(1);
    expect(screen.queryByText("Сессия истекла")).not.toBeInTheDocument();
  });

  it("keeps the authenticated shell visible on logout failure and retries cleanly", async () => {
    const logout = vi.fn()
      .mockRejectedValueOnce(new Error("secret server detail"))
      .mockResolvedValueOnce(undefined);
    render(
      <SessionGate api={api({ session: vi.fn(async () => ({ authenticated: true })), logout })}>
        {({ logout: signOut, logoutError }) => (
          <div>
            <p>Оболочка</p>
            {logoutError ? <p role="alert">{logoutError}</p> : null}
            <button onClick={signOut}>Выйти</button>
          </div>
        )}
      </SessionGate>,
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Выйти" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось выйти. Попробуйте ещё раз.");
    expect(screen.getByText("Оболочка")).toBeInTheDocument();
    expect(screen.queryByLabelText("Логин")).not.toBeInTheDocument();
    expect(screen.queryByText("secret server detail")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Выйти" }));

    expect(await screen.findByLabelText("Логин")).toHaveFocus();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(logout).toHaveBeenCalledTimes(2);
  });

  it("ignores a stale logout failure after an unauthorized transition", async () => {
    let rejectLogout!: (error: Error) => void;
    const logout = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectLogout = reject; }));
    let expire!: () => void;
    render(
      <SessionGate
        api={api({ session: vi.fn(async () => ({ authenticated: true })), logout })}
        registerUnauthorized={(handler) => { expire = handler; }}
      >
        {({ logout: signOut, logoutError }) => (
          <div>
            {logoutError ? <p role="alert">{logoutError}</p> : null}
            <button onClick={signOut}>Выйти</button>
          </div>
        )}
      </SessionGate>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Выйти" }));

    act(() => expire());
    await act(async () => rejectLogout(new Error("late secret")));

    expect(await screen.findByLabelText("Логин")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/late secret/)).not.toBeInTheDocument();
  });
});
