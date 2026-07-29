export type DatePreset = "today" | "7d" | "30d";

const ALMATY_TIME_ZONE = "Asia/Almaty";
const NBSP = "\u00a0";

function almatyDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ALMATY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function shiftIsoDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function almatyDatePreset(preset: DatePreset, now = new Date()) {
  const to = almatyDate(now);
  const inclusiveDays = preset === "today" ? 1 : preset === "7d" ? 7 : 30;
  return { from: shiftIsoDate(to, 1 - inclusiveDays), to };
}

export function formatMoney(value: string | number): string {
  const source = String(value).trim();
  const match = source.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return `0,00${NBSP}₸`;
  const [, sign, integer, rawFraction = ""] = match;
  const fraction = `${rawFraction}00`.slice(0, 2);
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${sign}${grouped},${fraction}${NBSP}₸`;
}

export function normalizePhotoUrl(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (normalized.startsWith("/") && !normalized.startsWith("//")) return normalized;
  try {
    const url = new URL(normalized);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function sortByMenuOrder<T extends { sortOrder: number; name: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) =>
    left.sortOrder - right.sortOrder
      || left.name.localeCompare(right.name, "ru", { sensitivity: "base" }));
}

type RussianNoun = "категория" | "блюдо" | "стол";

const FORMS: Record<RussianNoun, [string, string, string]> = {
  категория: ["категория", "категории", "категорий"],
  блюдо: ["блюдо", "блюда", "блюд"],
  стол: ["стол", "стола", "столов"],
};

export function pluralizeRussian(count: number, noun: RussianNoun): string {
  const absolute = Math.abs(count);
  const mod100 = absolute % 100;
  const mod10 = absolute % 10;
  const form = mod100 >= 11 && mod100 <= 14 ? 2 : mod10 === 1 ? 0 : mod10 >= 2 && mod10 <= 4 ? 1 : 2;
  return FORMS[noun][form];
}

export { ALMATY_TIME_ZONE };
