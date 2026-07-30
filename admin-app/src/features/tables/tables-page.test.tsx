import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { toast } from "sonner";
import { AdminApiError, type AdminApi } from "@/lib/api";
import type { Table } from "@/lib/types";
import { TablesPage } from "./tables-page";

const item = (id: string, number: string): Table => ({ id, number, createdAt: "2026-07-30T10:00:00Z" });
function api(tables: Table[] = []) {
  return { tables: { list: vi.fn().mockResolvedValue(tables), create: vi.fn(), delete: vi.fn(), downloadQr: vi.fn() } } as unknown as AdminApi;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
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

  it("validates trimmed values, duplicates, and prevents duplicate submit", async () => {
    const injected = api([item("1", "12")]);
    const user = userEvent.setup();
    render(<TablesPage api={injected} />);
    await screen.findByText("1 стол");
    await user.click(screen.getByRole("button", { name: "Добавить стол" }));
    const input = screen.getByLabelText("Номер стола");
    await user.type(input, " 12 ");
    await user.click(screen.getByRole("button", { name: "Создать стол" }));
    expect(screen.getByText("Стол с таким номером уже существует.")).toBeInTheDocument();
    await user.clear(input); await user.type(input, " 7 ");
    let resolveCreate!: (value: Table) => void;
    vi.mocked(injected.tables.create).mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));
    await user.click(screen.getByRole("button", { name: "Создать стол" }));
    await user.click(screen.getByRole("button", { name: "Создать стол" }));
    expect(injected.tables.create).toHaveBeenCalledOnce();
    expect(injected.tables.create).toHaveBeenCalledWith({ number: "7" });
    resolveCreate(item("server", "7"));
  });

  it.each([33, 100])("accepts a backend-valid table number with %i characters", async (length) => {
    const injected = api();
    const value = "x".repeat(length);
    vi.mocked(injected.tables.create).mockResolvedValue(item("server", value));
    const user = userEvent.setup();
    render(<TablesPage api={injected} />);
    await screen.findByText("Столов пока нет");
    await user.click(screen.getAllByRole("button", { name: "Добавить стол" })[0]);
    const input = screen.getByLabelText("Номер стола");
    expect(input).toHaveAttribute("maxlength", "100");
    await user.type(input, value);
    await user.click(screen.getByRole("button", { name: "Создать стол" }));
    expect(injected.tables.create).toHaveBeenCalledWith({ number: value });
  });

  it("rejects 101 characters and connects validation and API errors to the input", async () => {
    const injected = api();
    vi.mocked(injected.tables.create).mockRejectedValue(new AdminApiError("Стол с таким номером уже существует."));
    const user = userEvent.setup();
    render(<TablesPage api={injected} />);
    await screen.findByText("Столов пока нет");
    await user.click(screen.getAllByRole("button", { name: "Добавить стол" })[0]);
    const input = screen.getByLabelText("Номер стола");
    fireEvent.change(input, { target: { value: "x".repeat(101) } });
    await user.click(screen.getByRole("button", { name: "Создать стол" }));
    const validationError = screen.getByText("Номер стола должен быть не длиннее 100 символов.");
    expect(input).toHaveAttribute("aria-describedby", validationError.id);
    expect(injected.tables.create).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "9" } });
    await user.click(screen.getByRole("button", { name: "Создать стол" }));
    const apiError = await screen.findByText("Стол с таким номером уже существует.");
    expect(apiError.id).toBe(validationError.id);
    expect(input).toHaveAttribute("aria-describedby", apiError.id);
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
    expect(within(dialog).getByRole("button", { name: "Удалить стол" }).className).toContain("bg-destructive");
    await user.click(within(dialog).getByRole("button", { name: "Удалить стол" }));
    expect(await screen.findByText("У стола есть активная сессия.")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Скачать QR-код стола «1»" }));
    expect(injected.tables.downloadQr).toHaveBeenCalledWith("1", "1");
  });

  it.each(["success", "failure"] as const)("ignores late delete %s after unmount", async (outcome) => {
    const injected = api([item("1", "1")]);
    const deletion = deferred<void>();
    vi.mocked(injected.tables.delete).mockReturnValue(deletion.promise);
    const success = vi.spyOn(toast, "success");
    const user = userEvent.setup();
    const view = render(<TablesPage api={injected} />);
    await screen.findByText("1 стол");
    await user.click(screen.getByRole("button", { name: "Удалить стол «1»" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Удалить стол" }));
    view.unmount();
    await act(async () => {
      if (outcome === "success") deletion.resolve();
      else deletion.reject(new AdminApiError("Не удалось удалить стол."));
      await deletion.promise.catch(() => undefined);
    });
    expect(success).not.toHaveBeenCalledWith("Стол удалён.");
    success.mockRestore();
  });

  it.each(["success", "failure"] as const)("ignores late QR %s after unmount", async (outcome) => {
    const injected = api([item("1", "1")]);
    const qr = deferred<void>();
    vi.mocked(injected.tables.downloadQr).mockReturnValue(qr.promise);
    const success = vi.spyOn(toast, "success");
    const user = userEvent.setup();
    const view = render(<TablesPage api={injected} />);
    await screen.findByText("1 стол");
    await user.click(screen.getByRole("button", { name: "Скачать QR-код стола «1»" }));
    view.unmount();
    await act(async () => {
      if (outcome === "success") qr.resolve();
      else qr.reject(new AdminApiError("Не удалось создать QR-код."));
      await qr.promise.catch(() => undefined);
    });
    expect(success).not.toHaveBeenCalledWith("QR-код скачан.");
    success.mockRestore();
  });

  it("settles pending delete and QR errors while the current page remains mounted", async () => {
    const injected = api([item("1", "1")]);
    const deletion = deferred<void>();
    const qr = deferred<void>();
    vi.mocked(injected.tables.delete).mockReturnValue(deletion.promise);
    vi.mocked(injected.tables.downloadQr).mockReturnValue(qr.promise);
    const user = userEvent.setup();
    render(<TablesPage api={injected} />);
    await screen.findByText("1 стол");

    await user.click(screen.getByRole("button", { name: "Удалить стол «1»" }));
    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Удалить стол" }));
    expect(within(dialog).getByRole("button", { name: "Удалить стол" })).toBeDisabled();
    deletion.reject(new AdminApiError("Стол с историей заказов удалить нельзя."));
    expect(await within(dialog).findByText("Стол с историей заказов удалить нельзя.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Удалить стол" })).toBeEnabled();
    await user.keyboard("{Escape}");

    const download = screen.getByRole("button", { name: "Скачать QR-код стола «1»" });
    await user.click(download);
    expect(download).toBeDisabled();
    qr.reject(new AdminApiError("Не удалось создать QR-код."));
    expect(await screen.findByText("Не удалось создать QR-код.")).toBeInTheDocument();
    expect(download).toBeEnabled();
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
