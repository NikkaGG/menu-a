import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { AdminShell } from "./admin-shell";

describe("AdminShell", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });
  });
  it("shares Russian navigation between official sidebar and mobile sheet", async () => {
    render(<AdminShell route={{ page: "menu", canonicalPath: "/admin/menu", title: "Управление меню — Панель управления", heading: "Управление меню" }} onNavigate={vi.fn()} onLogout={vi.fn()}><p>Тело меню</p></AdminShell>);
    expect(screen.getAllByRole("link", { name: "Управление меню" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Столы и QR-коды" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Статистика" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("main")).toContainElement(screen.getByRole("heading", { name: "Управление меню" }));
  });

  it("exposes current theme and provides keyboard accessible theme choices", async () => {
    render(<AdminShell route={{ page: "stats", canonicalPath: "/stats", title: "Статистика — Панель управления", heading: "Статистика" }} onNavigate={vi.fn()} onLogout={vi.fn()}><p>Статистика</p></AdminShell>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Тема/ }));
    expect(screen.getByRole("menuitemradio", { name: "Тёмная" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Системная" })).toBeInTheDocument();
  });

  it("traps mobile navigation focus and restores the trigger after Escape", async () => {
    const user = userEvent.setup();
    render(<AdminShell route={{ page: "menu", canonicalPath: "/admin/menu", title: "Управление меню — Панель управления", heading: "Управление меню" }} onNavigate={vi.fn()} onLogout={vi.fn()}><p>Меню</p></AdminShell>);
    const trigger = screen.getByRole("button", { name: "Открыть меню" });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("marks active canonical navigation with aria-current", () => {
    render(<AdminShell route={{ page: "tables", canonicalPath: "/admin/tables", title: "Столы и QR-коды — Панель управления", heading: "Столы и QR-коды" }} onNavigate={vi.fn()} onLogout={vi.fn()}><p>Столы</p></AdminShell>);
    expect(screen.getAllByRole("link", { name: "Столы и QR-коды" }).some((link) => link.getAttribute("aria-current") === "page")).toBe(true);
  });

  it("updates title and heading focus without accessibility violations", async () => {
    const { container, rerender } = render(<AdminShell route={{ page: "menu", canonicalPath: "/admin/menu", title: "Управление меню — Панель управления", heading: "Управление меню" }} onNavigate={vi.fn()} onLogout={vi.fn()}><p>Меню</p></AdminShell>);
    rerender(<AdminShell route={{ page: "stats", canonicalPath: "/stats", title: "Статистика — Панель управления", heading: "Статистика" }} onNavigate={vi.fn()} onLogout={vi.fn()}><p>Данные</p></AdminShell>);
    expect(document.title).toBe("Статистика — Панель управления");
    expect(screen.getByRole("heading", { name: "Статистика" })).toHaveFocus();
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("keeps the shared header compact and accessible for long Russian headings", async () => {
    const heading = "Управление меню ".repeat(14);
    const { container } = render(
      <AdminShell
        route={{ page: "menu", canonicalPath: "/admin/menu", title: `${heading} — Панель управления`, heading }}
        onNavigate={vi.fn()}
        onLogout={vi.fn()}
      >
        <p>Меню</p>
      </AdminShell>,
    );
    const header = container.querySelector("header");
    expect(header?.className).toContain("min-w-0");
    expect(header?.className).toMatch(/flex-wrap|overflow/);
    expect(screen.getByRole("button", { name: "Открыть меню" })).toHaveAccessibleName("Открыть меню");
    expect(screen.getByRole("button", { name: /Тема:/ })).toHaveAccessibleName();
    expect(screen.getByRole("button", { name: "Выйти" })).toHaveAccessibleName("Выйти");
    const pageHeading = screen.getByRole("heading", { level: 1 });
    expect(pageHeading).toHaveTextContent(heading.trim());
    expect(pageHeading.className).toMatch(/min-w-0|break|overflow|truncate/);
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });
});
