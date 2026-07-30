import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import type { Statistics } from "@/lib/types";

function portionLabel(quantity: number) {
  const absolute = Math.abs(quantity);
  const mod100 = absolute % 100;
  const mod10 = absolute % 10;
  const form = mod100 >= 11 && mod100 <= 14
    ? "порций"
    : mod10 === 1
      ? "порция"
      : mod10 >= 2 && mod10 <= 4
        ? "порции"
        : "порций";
  return `${quantity} ${form}`;
}

export function StatsTable({
  points,
  showProfit,
}: {
  points: Statistics["points"];
  showProfit: boolean;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Данные по периодам</CardTitle>
        <CardDescription>Таблица содержит те же значения, что и график.</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        <Table aria-label="Данные графика">
          <TableCaption>Данные графика</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Период</TableHead>
              <TableHead scope="col">Выручка</TableHead>
              {showProfit ? <TableHead scope="col">Прибыль</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {points.map((point) => (
              <TableRow key={point.date}>
                <TableCell>{point.date}</TableCell>
                <TableCell>{formatMoney(point.revenue)}</TableCell>
                {showProfit ? <TableCell>{point.profit === null ? "—" : formatMoney(point.profit)}</TableCell> : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function TopDishes({ dishes }: { dishes: Statistics["topDishes"] }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Популярные блюда</CardTitle>
        <CardDescription>Пять блюд с наибольшим числом заказанных порций.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex min-w-0 list-decimal flex-col gap-3 pl-5">
          {dishes.slice(0, 5).map((dish, index) => (
            <li className="min-w-0 pl-1" key={`${dish.dishName}-${index}`}>
              <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <span className="min-w-0 [overflow-wrap:anywhere]">{dish.dishName}</span>
                <span className="shrink-0 text-muted-foreground">{portionLabel(dish.quantity)}</span>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
