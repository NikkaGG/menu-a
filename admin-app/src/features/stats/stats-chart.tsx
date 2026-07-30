import { Component, type ReactNode } from "react";
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

export function StatsChart({ points, showProfit }: StatsChartProps) {
  const data = points.map((point) => ({
    date: point.date,
    revenue: Number(point.revenue),
    profit: point.profit === null ? null : Number(point.profit),
  }));

  return (
    <ChartErrorBoundary>
      <ChartContainer
        className="min-h-64 w-full"
        config={chartConfig}
        role="img"
        aria-label={showProfit ? "График выручки и прибыли" : "График выручки"}
      >
        <LineChart accessibilityLayer data={data} margin={{ left: 8, right: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={(value) => formatMoney(String(value))} />
          <ChartTooltip
            content={(
              <ChartTooltipContent
                formatter={(value, name) => (
                  <>
                    <span className="text-muted-foreground">{name === "profit" ? "Прибыль" : "Выручка"}</span>
                    <span className="font-mono font-medium tabular-nums">{formatMoney(String(value))}</span>
                  </>
                )}
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
}
