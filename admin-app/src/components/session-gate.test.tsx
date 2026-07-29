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
});
