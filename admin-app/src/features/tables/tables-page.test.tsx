import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { AdminApiError, type AdminApi } from "@/lib/api";
import type { Table } from "@/lib/types";
import { TablesPage } from "./tables-page";

const item = (id: string, number: string): Table => ({ id, number, createdAt: "2026-07-30T10:00:00Z" });
function api(tables: Table[] = []) {
  return { tables: { list: vi.fn().mockResolvedValue(tables), create: vi.fn(), delete: vi.fn(), downloadQr: vi.fn() } } as unknown as AdminApi;
}

describe("TablesPage", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
  });

  it("shows skeleton, Russian count, empty state and retry error", async () => {
    const injected = api();
    vi.mocked(injected.tables.list).mockRejectedValueOnce(new Error("secret")).mockResolvedValueOnce([]);
    const { container } = render(<TablesPage api={injected} />);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(await screen.findByText("Столы не загружены")).toBeInTheDocument();
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByText("Столов пока нет")).toBeInTheDocument();
  });

  it("validates trimmed values, max length, duplicates, and prevents duplicate submit", async () => {
    const injected = api([item("1", "12")]);
    const user = userEvent.setup();
    render(<TablesPage api={injected} />);
    await screen.findByText("1 стол");
    await user.click(screen.getByRole("button", { name: "Добавить стол" }));
    const input = screen.getByLabelText("Номер стола");
    await user.type(input, " 12 ");
    await user.click(screen.getByRole("button", { name: "Создать стол" }));
    expect(screen.getByText("Стол с таким номером уже существует.")).toBeInTheDocument();
    await user.clear(input); await user.type(input, "x".repeat(33));
    await user.click(screen.getByRole("button", { name: "Создать стол" }));
    expect(screen.getByText(/не длиннее 32/)).toBeInTheDocument();
    await user.clear(input); await user.type(input, " 7 ");
    let resolveCreate!: (value: Table) => void;
    vi.mocked(injected.tables.create).mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));
    await user.click(screen.getByRole("button", { name: "Создать стол" }));
    await user.click(screen.getByRole("button", { name: "Создать стол" }));
    expect(injected.tables.create).toHaveBeenCalledOnce();
    expect(injected.tables.create).toHaveBeenCalledWith({ number: "7" });
    resolveCreate(item("server", "7"));
  });

  it("confirms deletion, shows pending state, maps protected errors, and delegates QR download", async () => {
    const injected = api([item("1", "1")]);
    const user = userEvent.setup();
    vi.mocked(injected.tables.delete).mockRejectedValue(new AdminApiError("У стола есть активная сессия."));
    render(<TablesPage api={injected} />);
    await screen.findByText("1 стол");
    await user.click(screen.getByRole("button", { name: "Удалить стол «1»" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/активной сессией/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Удалить стол" }));
    expect(await screen.findByText("У стола есть активная сессия.")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Скачать QR-код стола «1»" }));
    expect(injected.tables.downloadQr).toHaveBeenCalledWith("1", "1");
  });

  it("keeps overflow inside the table region and passes axe", async () => {
    const long = "ОченьДлинныйСтол".repeat(10);
    const injected = api([item("1", long)]);
    const { container } = render(<TablesPage api={injected} />);
    await screen.findByText(long);
    const region = container.querySelector("[data-table-scroll-region]");
    expect(region?.className).toMatch(/overflow-x-auto/);
    expect(container.querySelector('[data-tables-page="true"]')?.className).toContain("min-w-0");
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });
});
