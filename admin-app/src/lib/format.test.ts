import { describe, expect, it } from "vitest";

import {
  almatyDatePreset,
  formatInteger,
  formatMoney,
  normalizePhotoUrl,
  pluralizeRussian,
  sortByMenuOrder,
} from "./format";

describe("admin formatting", () => {
  it("produces inclusive Almaty date presets", () => {
    expect(almatyDatePreset("today", new Date("2026-07-29T01:00:00Z"))).toEqual({
      from: "2026-07-29",
      to: "2026-07-29",
    });
    expect(almatyDatePreset("7d", new Date("2026-07-29T01:00:00Z"))).toEqual({
      from: "2026-07-23",
      to: "2026-07-29",
    });
  });

  it("formats decimal money strings without binary floating point loss", () => {
    expect(formatMoney("1200.50")).toBe("1 200,50 ₸");
    expect(formatMoney("12")).toBe("12,00 ₸");
    expect(formatMoney("1.999")).toBe("2,00 ₸");
    expect(formatMoney("0")).toBe("0,00 ₸");
    expect(formatMoney("-0")).toBe("0,00 ₸");
    expect(formatMoney("-1.995")).toBe("-2,00 ₸");
    expect(formatMoney("1.994")).toBe("1,99 ₸");
  });

  it("formats truncated integers with Russian grouping", () => {
    expect(formatInteger(0)).toBe("0");
    expect(formatInteger(12)).toBe("12");
    expect(formatInteger(1234.9)).toMatch(/^1[\u00a0\u202f]234$/);
    expect(formatInteger(-12.9)).toBe("-12");
  });

  it("formats non-finite integers as zero", () => {
    expect(formatInteger(Number.NaN)).toBe("0");
    expect(formatInteger(Number.POSITIVE_INFINITY)).toBe("0");
  });

  it("normalizes only safe photo URLs", () => {
    expect(normalizePhotoUrl(" /uploads/dish.jpg ")).toBe("/uploads/dish.jpg");
    expect(normalizePhotoUrl("https://cdn.example/dish.jpg")).toBe("https://cdn.example/dish.jpg");
    expect(normalizePhotoUrl("javascript:alert(1)")).toBeNull();
    expect(normalizePhotoUrl("data:image/png;base64,abc")).toBeNull();
    expect(normalizePhotoUrl("/uploads\\dish.jpg")).toBeNull();
    expect(normalizePhotoUrl("/\\evil.example/image.jpg")).toBeNull();
    expect(normalizePhotoUrl("/uploads/\u0000dish.jpg")).toBeNull();
    expect(normalizePhotoUrl("\nhttps://cdn.example/dish.jpg")).toBeNull();
    expect(normalizePhotoUrl("/uploads/dish.jpg\r")).toBeNull();
    expect(normalizePhotoUrl("//evil.example/image.jpg")).toBeNull();
    expect(normalizePhotoUrl("ftp://example.com/dish.jpg")).toBeNull();
  });

  it("sorts numeric order with stable Russian name fallback", () => {
    expect(sortByMenuOrder([
      { sortOrder: 2, name: "Б" },
      { sortOrder: 1, name: "Я" },
      { sortOrder: 2, name: "А" },
    ]).map((item) => item.name)).toEqual(["Я", "А", "Б"]);
  });

  it("uses Russian category, dish, and table pluralization", () => {
    expect(pluralizeRussian(1, "категория")).toBe("категория");
    expect(pluralizeRussian(2, "блюдо")).toBe("блюда");
    expect(pluralizeRussian(5, "стол")).toBe("столов");
    expect(pluralizeRussian(22, "категория")).toBe("категории");
  });
});
