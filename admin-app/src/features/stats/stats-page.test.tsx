import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";

import { AdminApiError, type AdminApi } from "@/lib/api";
import type { Statistics } from "@/lib/types";
import { StatsPage } from "./stats-page";

const chartState = vi.hoisted(() => ({ fail: false, mounts: 0, cleanups: 0 }));

vi.mock("recharts", async () => {
  const React = await import("react");
  const Wrapper = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return {
    ResponsiveContainer: Wrapper,
    LineChart: ({ children }: { children?: React.ReactNode }) => {
      React.useEffect(() => {
        chartState.mounts += 1;
        return () => { chartState.cleanups += 1; };
      }, []);
      if (chartState.fail) throw new Error("chart internals");
      return <div data-testid="stats-chart">{children}</div>;
    },
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Line: ({ dataKey }: { dataKey: string }) => <span data-chart-series={dataKey} />,
    Tooltip: () => null,
    Legend: () => null,
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function statistics(overrides: Partial<Statistics> = {}): Statistics {
  return {
    range: {
      from: "2026-03-26",
      to: "2026-04-01",
      groupBy: "day",
      timeZone: "Asia/Almaty",
    },
    totalRevenue: "12500.505",
    totalProfit: "3500.255",
    points: [
      { date: "2026-03-31", revenue: "10000.50", profit: "3000.25" },
      { date: "2026-04-01", revenue: "2500.005", profit: "500.005" },
    ],
    topDishes: [
      { dishName: "Первое", quantity: 1 },
      { dishName: "Второе", quantity: 2 },
      { dishName: "Третье", quantity: 5 },
      { dishName: "Четвёртое", quantity: 11 },
      { dishName: "Пятое", quantity: 22 },
      { dishName: "Шестое", quantity: 100 },
    ],
    ...overrides,
  };
}

function mockApi(result: Statistics = statistics()) {
  return { stats: vi.fn().mockResolvedValue(result) } as unknown as AdminApi;
}

describe("StatsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-31T19:30:00.000Z"));
    chartState.fail = false;
    chartState.mounts = 0;
    chartState.cleanups = 0;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    if (!HTMLElement.prototype.hasPointerCapture) {
      HTMLElement.prototype.hasPointerCapture = () => false;
      HTMLElement.prototype.setPointerCapture = () => {};
      HTMLElement.prototype.releasePointerCapture = () => {};
    }
    HTMLElement.prototype.scrollIntoView = () => {};
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("uses deterministic inclusive Almaty presets and requests each selected preset", async () => {
    const api = mockApi();
    const user = userEvent.setup();
    render(<StatsPage api={api} />);

    await waitFor(() => expect(api.stats).toHaveBeenCalledWith({
      from: "2026-03-26",
      to: "2026-04-01",
      groupBy: "day",
    }));
    await user.click(screen.getByRole("button", { name: "Последние 30 дней" }));
    expect(api.stats).toHaveBeenLastCalledWith({ from: "2026-03-03", to: "2026-04-01", groupBy: "day" });
    await user.click(screen.getByRole("button", { name: "Текущий месяц" }));
    expect(api.stats).toHaveBeenLastCalledWith({ from: "2026-04-01", to: "2026-04-01", groupBy: "day" });
  });

  it("submits custom inclusive dates and exact day, week, and month grouping queries", async () => {
    const api = mockApi();
    const user = userEvent.setup();
    render(<StatsPage api={api} />);
    await screen.findByText(/12\s?500,51\s?₸/);

    await user.clear(screen.getByLabelText("Дата начала"));
    await user.type(screen.getByLabelText("Дата начала"), "2026-01-01");
    await user.clear(screen.getByLabelText("Дата окончания"));
    await user.type(screen.getByLabelText("Дата окончания"), "2026-01-31");
    const grouping = screen.getByRole("combobox", { name: "Группировка" });
    grouping.focus();
    await user.keyboard("{Enter}{ArrowDown}{Enter}");
    await user.click(screen.getByRole("button", { name: "Показать статистику" }));
    expect(api.stats).toHaveBeenLastCalledWith({ from: "2026-01-01", to: "2026-01-31", groupBy: "week" });

    grouping.focus();
    await user.keyboard("{Enter}{End}{Enter}");
    await user.click(screen.getByRole("button", { name: "Показать статистику" }));
    expect(api.stats).toHaveBeenLastCalledWith({ from: "2026-01-01", to: "2026-01-31", groupBy: "month" });
  });

  it("shows loading skeletons, clears stale results, localizes errors, and retries persistently", async () => {
    const pending = deferred<Statistics>();
    const api = mockApi();
    vi.mocked(api.stats)
      .mockReturnValueOnce(pending.promise)
      .mockRejectedValueOnce(new Error("database internals"))
      .mockResolvedValueOnce(statistics());
    const user = userEvent.setup();
    const { container } = render(<StatsPage api={api} />);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    pending.resolve(statistics());
    expect(await screen.findByText(/12\s?500,51\s?₸/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Обновить" }));
    expect(await screen.findByText("Не удалось загрузить статистику. Попробуйте ещё раз.")).toBeInTheDocument();
    expect(screen.queryByText("database internals")).not.toBeInTheDocument();
    expect(screen.queryByText(/12\s?500,51\s?₸/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повторить" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Повторить" }));
    expect(await screen.findByText(/12\s?500,51\s?₸/)).toBeInTheDocument();
  });

  it("renders an empty state when the selected period has no points or dishes", async () => {
    render(<StatsPage api={mockApi(statistics({ totalRevenue: "0", totalProfit: "0", points: [], topDishes: [] }))} />);
    expect(await screen.findByText("За выбранный период статистики нет")).toBeInTheDocument();
  });

  it("prevents stale ranges and unmounted work from changing current state", async () => {
    const older = deferred<Statistics>();
    const latest = deferred<Statistics>();
    const api = mockApi();
    vi.mocked(api.stats).mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise);
    const user = userEvent.setup();
    const { unmount } = render(<StatsPage api={api} />);
    await user.click(screen.getByRole("button", { name: "Последние 30 дней" }));
    latest.resolve(statistics({ totalRevenue: "99.00" }));
    expect(await screen.findByText(/99,00\s?₸/)).toBeInTheDocument();
    older.resolve(statistics({ totalRevenue: "1.00" }));
    await waitFor(() => expect(screen.queryByText(/1,00\s?₸/)).not.toBeInTheDocument());

    unmount();
    expect(chartState.cleanups).toBeGreaterThan(0);
  });

  it("suppresses shared handled 401 errors while authentication transitions", async () => {
    const api = mockApi();
    vi.mocked(api.stats).mockRejectedValue(new AdminApiError("Сессия истекла. Войдите снова.", { status: 401, authHandled: true }));
    render(<StatsPage api={api} />);
    await waitFor(() => expect(api.stats).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("formats decimal KPIs, distinguishes zero from null, and omits unavailable profit series", async () => {
    const { rerender } = render(<StatsPage api={mockApi(statistics({ totalProfit: "0" }))} />);
    expect(await screen.findByText(/12\s?500,51\s?₸/)).toBeInTheDocument();
    expect(screen.getByText(/0,00\s?₸/)).toBeInTheDocument();
    expect(document.querySelector('[data-chart-series="profit"]')).toBeInTheDocument();

    rerender(<StatsPage api={mockApi(statistics({
      totalProfit: null,
      points: statistics().points.map((point) => ({ ...point, profit: null })),
    }))} />);
    expect(await screen.findByText("Прибыль недоступна")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Указать себестоимость блюд" })).toHaveAttribute("href", "/admin/menu");
    expect(screen.getByRole("img", { name: "График выручки" })).toBeInTheDocument();
    expect(document.querySelector('[data-chart-series="profit"]')).not.toBeInTheDocument();
  });

  it("keeps the accessible point table exactly equivalent to chart data", async () => {
    render(<StatsPage api={mockApi()} />);
    await screen.findByTestId("stats-chart");
    const table = screen.getByRole("table", { name: "Данные графика" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("2026-03-31")).toBeInTheDocument();
    expect(within(table).getByText(/10\s?000,50\s?₸/)).toBeInTheDocument();
    expect(within(table).getByText(/3\s?000,25\s?₸/)).toBeInTheDocument();
    expect(within(table).getByText("2026-04-01")).toBeInTheDocument();
    expect(within(table).getByText(/^2\s?500,01\s?₸$/)).toBeInTheDocument();
    expect(within(table).getByText(/^500,01\s?₸$/)).toBeInTheDocument();
  });

  it("contains chart rendering failures while preserving KPIs and the table fallback", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    chartState.fail = true;
    render(<StatsPage api={mockApi()} />);
    expect(await screen.findByText("График недоступен. Данные приведены в таблице.")).toHaveAttribute("role", "status");
    expect(screen.getByText(/12\s?500,51\s?₸/)).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Данные графика" })).toBeInTheDocument();
    expect(screen.queryByText("chart internals")).not.toBeInTheDocument();
  });

  it("shows only five top dishes with Russian quantity forms and wraps long names", async () => {
    const longName = "ОченьДлинноеНазваниеБезПробелов".repeat(8);
    render(<StatsPage api={mockApi(statistics({
      topDishes: [{ dishName: longName, quantity: 1 }, ...statistics().topDishes],
    }))} />);
    await screen.findByText(longName);
    expect(screen.getAllByText("1 порция")).toHaveLength(2);
    expect(screen.getByText("2 порции")).toBeInTheDocument();
    expect(screen.getByText("5 порций")).toBeInTheDocument();
    expect(screen.queryByText("Пятое")).not.toBeInTheDocument();
    expect(screen.getByText(longName).className).toMatch(/overflow-wrap/);
  });

  it("validates required, ordered, and inclusive 366-day backend ranges and prevents duplicate submits", async () => {
    const api = mockApi();
    const pending = deferred<Statistics>();
    vi.mocked(api.stats).mockResolvedValueOnce(statistics()).mockReturnValueOnce(pending.promise);
    const user = userEvent.setup();
    render(<StatsPage api={api} />);
    await screen.findByText(/12\s?500,51\s?₸/);
    const from = screen.getByLabelText("Дата начала");
    const to = screen.getByLabelText("Дата окончания");

    await user.clear(from);
    await user.click(screen.getByRole("button", { name: "Показать статистику" }));
    expect(screen.getByText("Укажите дату начала.")).toBeInTheDocument();
    expect(from).toHaveAttribute("aria-invalid", "true");
    await user.type(from, "2025-01-01");
    await user.clear(to);
    await user.type(to, "2026-01-02");
    await user.click(screen.getByRole("button", { name: "Показать статистику" }));
    expect(screen.getByText("Период не может превышать 366 дней включительно.")).toBeInTheDocument();
    expect(api.stats).toHaveBeenCalledOnce();

    await user.clear(to);
    await user.type(to, "2026-01-01");
    const submit = screen.getByRole("button", { name: "Показать статистику" });
    await user.click(submit);
    await user.click(submit);
    expect(api.stats).toHaveBeenCalledTimes(2);
    expect(submit).toBeDisabled();
    pending.resolve(statistics());
  });

  it("preserves safe backend validation, semantic responsive layout, targets, themes, and accessibility", async () => {
    const api = mockApi();
    vi.mocked(api.stats)
      .mockRejectedValueOnce(new AdminApiError("Проверьте выбранный период."))
      .mockResolvedValueOnce(statistics());
    const { container } = render(<StatsPage api={api} />);
    expect(await screen.findByText("Проверьте выбранный период.")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Повторить" }));
    await screen.findByText(/12\s?500,51\s?₸/);
    const page = container.querySelector('[data-stats-page="true"]');
    expect(page?.className).toContain("min-w-0");
    expect(page?.className).toContain("overflow-x-hidden");
    expect(container.querySelector('[data-stats-filters="true"]')?.className).toMatch(/grid-cols-1/);
    expect(container.querySelector('[data-stats-kpis="true"]')?.className).toMatch(/grid-cols-1/);
    expect(container.querySelector('[data-slot="table-container"]')?.className).toMatch(/overflow-x-auto/);
    for (const control of screen.getAllByRole("button")) expect(control.className).toMatch(/min-h-11/);
    for (const input of container.querySelectorAll('input[type="date"]')) expect(input.className).toMatch(/min-h-11/);
    expect(container.innerHTML).not.toMatch(/(?:bg|text)-(?:red|blue|green|gray)-\d+/);
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });
});
