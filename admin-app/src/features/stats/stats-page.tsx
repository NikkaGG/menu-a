import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronUpIcon, RefreshCwIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { AdminApiError, type AdminApi } from "@/lib/api";
import { createConcurrencyGuard } from "@/lib/concurrency";
import {
  ALMATY_TIME_ZONE,
  almatyDatePreset,
  formatInteger,
  formatMoney,
} from "@/lib/format";
import type { Statistics } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatsChart } from "./stats-chart";
import { StatsFilters, type StatsQuery } from "./stats-filters";
import { StatsTable, TopDishes } from "./stats-table";

const GENERIC_ERROR = "Не удалось загрузить статистику. Попробуйте ещё раз.";

function currentMonth(now = new Date()) {
  const { to } = almatyDatePreset("7d", now);
  return { from: `${to.slice(0, 7)}-01`, to };
}

function validate(query: StatsQuery) {
  const errors: Partial<Record<"from" | "to" | "range", string>> = {};
  if (!query.from) errors.from = "Укажите дату начала.";
  if (!query.to) errors.to = "Укажите дату окончания.";
  if (errors.from || errors.to) return errors;
  const from = Date.parse(`${query.from}T00:00:00.000Z`);
  const to = Date.parse(`${query.to}T00:00:00.000Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    errors.range = "Укажите корректный период.";
  } else if (to < from) {
    errors.range = "Дата окончания не может быть раньше даты начала.";
  } else if (((to - from) / 86_400_000) + 1 > 366) {
    errors.range = "Период не может превышать 366 дней включительно.";
  }
  return errors;
}

function safeError(error: unknown) {
  if (error instanceof AdminApiError && error.message) return error.message;
  return GENERIC_ERROR;
}

function StatsLoading() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" role="status" aria-label="Загружаем статистику">
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-72 rounded-xl lg:col-span-2" />
    </div>
  );
}

function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>За выбранный период</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

export function StatsPage({ api }: { api: AdminApi }) {
  const initial = almatyDatePreset("7d");
  const [query, setQuery] = useState<StatsQuery>({ ...initial, groupBy: "day" });
  const [submittedQuery, setSubmittedQuery] = useState<StatsQuery>({ ...initial, groupBy: "day" });
  const [data, setData] = useState<Statistics | null>(null);
  const [dataRevision, setDataRevision] = useState(0);
  const [chartExpanded, setChartExpanded] = useState(true);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<"from" | "to" | "range", string>>>({});
  const guard = useRef(createConcurrencyGuard());
  const mounted = useRef(true);
  const activeRequest = useRef<AbortController | null>(null);

  const load = useCallback(async (nextQuery: StatsQuery) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const token = guard.current.beginLoad("statistics");
    setPending(true);
    setError(null);
    setData(null);
    try {
      const result = await api.stats(nextQuery, { signal: controller.signal });
      if (!mounted.current || !guard.current.isCurrentLoad("statistics", token)) return;
      setDataRevision((revision) => revision + 1);
      setData(result);
    } catch (caught) {
      if (typeof caught === "object" && caught !== null && "name" in caught && caught.name === "AbortError") return;
      if (!mounted.current || !guard.current.isCurrentLoad("statistics", token)) return;
      if (!(caught instanceof AdminApiError && caught.authHandled)) setError(safeError(caught));
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
      if (mounted.current && guard.current.isCurrentLoad("statistics", token)) setPending(false);
    }
  }, [api]);

  useEffect(() => {
    const currentGuard = guard.current;
    mounted.current = true;
    void load(submittedQuery);
    return () => {
      mounted.current = false;
      activeRequest.current?.abort();
      activeRequest.current = null;
      currentGuard.invalidate();
    };
  }, [load, submittedQuery]);

  const submitQuery = (nextQuery: StatsQuery, allowPending = false) => {
    if (pending && !allowPending) return;
    const nextErrors = validate(nextQuery);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSubmittedQuery({ ...nextQuery });
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitQuery(query);
  };

  const onPreset = (preset: "7d" | "30d" | "month") => {
    const range = preset === "month" ? currentMonth() : almatyDatePreset(preset);
    const nextQuery = { ...query, ...range };
    setQuery(nextQuery);
    setErrors({});
    submitQuery(nextQuery, true);
  };

  const hasNoStatistics = Boolean(data && data.points.length === 0 && data.topDishes.length === 0);
  const showProfit = data?.totalProfit !== null;
  const chartKey = data ? `statistics-${dataRevision}` : "empty";

  return (
    <section
      className="flex min-w-0 max-w-full flex-col gap-6 overflow-x-hidden"
      data-stats-page="true"
      aria-label="Статистика заказов"
    >
      <p className="text-sm text-muted-foreground">
        Выручка и прибыль по оформленным заказам. Часовой пояс: Алматы ({ALMATY_TIME_ZONE}).
      </p>
      <StatsFilters
        query={query}
        pending={pending}
        errors={errors}
        onChange={(nextQuery) => {
          setQuery(nextQuery);
          setErrors({});
        }}
        onPreset={onPreset}
        onSubmit={onSubmit}
      />

      {pending ? <StatsLoading /> : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Статистику загрузить не удалось</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <Button className="mt-3 min-h-11" type="button" variant="outline" onClick={() => void load(submittedQuery)}>
            Повторить
          </Button>
        </Alert>
      ) : null}

      {data ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-stats-kpis="true">
            <KpiCard title="Общая выручка" value={formatMoney(data.totalRevenue)} />
            <KpiCard title="Количество заказов" value={formatInteger(data.orderCount)} />
            <KpiCard title="Средний чек" value={data.averageCheck === null ? "—" : formatMoney(data.averageCheck)} />
            {showProfit ? <KpiCard title="Общая прибыль" value={formatMoney(data.totalProfit ?? "0")} /> : null}
          </div>

          {!showProfit ? (
            <Alert>
              <AlertTitle>Прибыль недоступна</AlertTitle>
              <AlertDescription>
                Для расчёта прибыли <a href="/admin/menu">Указать себестоимость блюд</a>.
              </AlertDescription>
            </Alert>
          ) : null}

          {hasNoStatistics ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>За выбранный период статистики нет</EmptyTitle>
                <EmptyDescription>Попробуйте выбрать другой период.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex min-w-0 flex-col gap-4">
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle>Динамика заказов</CardTitle>
                  <CardDescription>Выручка{showProfit ? " и прибыль" : ""} по выбранной группировке.</CardDescription>
                  <CardAction>
                    <Button
                      className="size-11"
                      type="button"
                      variant="ghost"
                      aria-expanded={chartExpanded}
                      aria-controls="statistics-chart-region"
                      aria-label={chartExpanded ? "Свернуть график" : "Развернуть график"}
                      onClick={() => setChartExpanded((expanded) => !expanded)}
                    >
                      <ChevronUpIcon
                        className={cn(
                          "transition-transform duration-300",
                          !chartExpanded && "rotate-180",
                        )}
                        data-icon="inline-start"
                      />
                    </Button>
                  </CardAction>
                </CardHeader>
                <div
                  className={cn(
                    "grid min-w-0 transition-[grid-template-rows,opacity] duration-300 ease-out",
                    chartExpanded
                      ? "grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0",
                  )}
                  data-testid="statistics-chart-collapse"
                >
                  <div
                    id="statistics-chart-region"
                    data-testid="statistics-chart-region"
                    aria-hidden={!chartExpanded}
                    inert={chartExpanded ? undefined : true}
                    className="min-h-0 overflow-hidden"
                  >
                    <CardContent className="min-w-0">
                      <StatsChart key={chartKey} points={data.points} showProfit={showProfit} />
                    </CardContent>
                  </div>
                </div>
              </Card>
              <StatsTable points={data.points} showProfit={showProfit} />
              {data.topDishes.length ? <TopDishes dishes={data.topDishes} /> : null}
            </div>
          )}
        </>
      ) : null}

      <Button
        className="min-h-11 self-start"
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => submitQuery(query)}
      >
        <RefreshCwIcon data-icon="inline-start" />
        Обновить
      </Button>
      <Toaster />
    </section>
  );
}
