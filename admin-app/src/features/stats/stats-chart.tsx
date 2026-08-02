import { Component, memo, useMemo, type ReactNode } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatMoney } from "@/lib/format";
import type { Statistics } from "@/lib/types";

const chartConfig = {
  revenue: {
    label: "Выручка",
    color: "var(--chart-1)",
  },
  profit: {
    label: "Прибыль",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

const compactNumber = new Intl.NumberFormat("ru-RU", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCompactMoney(value: string | number): string {
  const number = Number(value);
  return `${compactNumber.format(Number.isFinite(number) ? number : 0)}\u00a0₸`;
}

class ChartErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="text-sm text-muted-foreground" role="status">
          График недоступен. Данные приведены в таблице.
        </p>
      );
    }
    return this.props.children;
  }
}

type StatsChartProps = {
  points: Statistics["points"];
  showProfit: boolean;
};

export const StatsChart = memo(function StatsChart({ points, showProfit }: StatsChartProps) {
  const data = useMemo(() => points.map((point) => ({
    date: point.date,
    revenue: Number(point.revenue),
    profit: point.profit === null ? null : Number(point.profit),
    revenueRaw: point.revenue,
    profitRaw: point.profit,
  })), [points]);

  return (
    <ChartErrorBoundary>
      <ChartContainer
        className="h-[280px] min-h-0 w-full aspect-auto"
        config={chartConfig}
        role="img"
        aria-label={showProfit ? "График выручки и прибыли" : "График выручки"}
      >
        <LineChart accessibilityLayer data={data} margin={{ left: 4, right: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={formatCompactMoney} />
          <ChartTooltip
            content={(
              <ChartTooltipContent
                formatter={(value, name, item) => {
                  const rawValue = item.dataKey === "profit"
                    ? item.payload.profitRaw
                    : item.payload.revenueRaw;
                  return (
                    <>
                      <span className="text-muted-foreground" data-series-name={String(name)}>
                        {item.dataKey === "profit" ? "Прибыль" : "Выручка"}
                      </span>
                      <span className="font-mono font-medium tabular-nums">
                        {formatMoney(typeof rawValue === "string" ? rawValue : String(value))}
                      </span>
                    </>
                  );
                }}
              />
            )}
          />
          <Line
            dataKey="revenue"
            name="Выручка"
            type="monotone"
            stroke="var(--color-revenue)"
            strokeWidth={2}
            dot={false}
          />
          {showProfit ? (
            <Line
              dataKey="profit"
              name="Прибыль"
              type="monotone"
              stroke="var(--color-profit)"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          ) : null}
        </LineChart>
      </ChartContainer>
    </ChartErrorBoundary>
  );
});
