import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type StatsQuery = {
  from: string;
  to: string;
  groupBy: "day" | "week" | "month";
};

type FilterErrors = Partial<Record<"from" | "to" | "range", string>>;

type StatsFiltersProps = {
  query: StatsQuery;
  pending: boolean;
  errors: FilterErrors;
  onChange: (query: StatsQuery) => void;
  onPreset: (preset: "7d" | "30d" | "month") => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function StatsFilters({
  query,
  pending,
  errors,
  onChange,
  onPreset,
  onSubmit,
}: StatsFiltersProps) {
  return (
    <form
      className="flex min-w-0 flex-col gap-5"
      aria-label="Фильтры статистики"
      onSubmit={onSubmit}
    >
      <FieldGroup>
        <Field>
          <FieldLabel>Быстрый период</FieldLabel>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button className="min-h-11" type="button" variant="outline" onClick={() => onPreset("7d")}>
              Последние 7 дней
            </Button>
            <Button className="min-h-11" type="button" variant="outline" onClick={() => onPreset("30d")}>
              Последние 30 дней
            </Button>
            <Button className="min-h-11" type="button" variant="outline" onClick={() => onPreset("month")}>
              Текущий месяц
            </Button>
          </div>
        </Field>
      </FieldGroup>
      <FieldGroup
        data-stats-filters="true"
        className="grid grid-cols-1 gap-4 md:grid-cols-4"
      >
        <Field data-invalid={Boolean(errors.from || errors.range)}>
          <FieldLabel htmlFor="stats-from">Дата начала</FieldLabel>
          <Input
            className="min-h-11"
            id="stats-from"
            type="date"
            value={query.from}
            disabled={pending}
            aria-invalid={Boolean(errors.from || errors.range)}
            aria-describedby={errors.from ? "stats-from-error" : errors.range ? "stats-range-error" : undefined}
            onChange={(event) => onChange({ ...query, from: event.target.value })}
          />
          <FieldError id="stats-from-error">{errors.from}</FieldError>
        </Field>
        <Field data-invalid={Boolean(errors.to || errors.range)}>
          <FieldLabel htmlFor="stats-to">Дата окончания</FieldLabel>
          <Input
            className="min-h-11"
            id="stats-to"
            type="date"
            value={query.to}
            disabled={pending}
            aria-invalid={Boolean(errors.to || errors.range)}
            aria-describedby={errors.to ? "stats-to-error" : errors.range ? "stats-range-error" : undefined}
            onChange={(event) => onChange({ ...query, to: event.target.value })}
          />
          <FieldError id="stats-to-error">{errors.to}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="stats-group-by">Группировка</FieldLabel>
          <Select
            value={query.groupBy}
            disabled={pending}
            onValueChange={(value) => onChange({ ...query, groupBy: value as StatsQuery["groupBy"] })}
          >
            <SelectTrigger className="min-h-11 w-full" id="stats-group-by" aria-label="Группировка">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="day">По дням</SelectItem>
                <SelectItem value="week">По неделям</SelectItem>
                <SelectItem value="month">По месяцам</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field className="justify-end">
          <Button className="min-h-11" type="submit" disabled={pending}>
            {pending ? "Загрузка…" : "Показать статистику"}
          </Button>
        </Field>
      </FieldGroup>
      <FieldError id="stats-range-error">{errors.range}</FieldError>
    </form>
  );
}
