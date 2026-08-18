import { describe, expect, it } from "vitest";

import { fromScaled, quote, selectCard, selectRow, toScaled, type Card, type RateRow } from "./rate";

const row = (over: Partial<RateRow> = {}): RateRow => ({
  originZoneId: null,
  destinationZoneId: null,
  baseWeight: "0.500",
  baseAmount: "80.0000",
  additionalWeight: "0.500",
  additionalAmount: "40.0000",
  minimumAmount: null,
  ...over,
});

describe("decimal handling", () => {
  it("round-trips without losing places", () => {
    for (const value of ["0.0000", "1.5000", "80", "1234567.8901", "-12.3400"]) {
      expect(fromScaled(toScaled(value))).toBe(
        value.includes(".") ? value.padEnd(value.indexOf(".") + 5, "0") : `${value}.0000`,
      );
    }
  });

  it("refuses anything that is not a number", () => {
    for (const value of ["", "abc", "1.2.3", "1,200", "12px"]) {
      expect(() => toScaled(value)).toThrow();
    }
  });

  it("adds money exactly where a float would not", () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point. This is the whole reason
    // the module works in scaled integers.
    const sum = toScaled("0.1") + toScaled("0.2");
    expect(fromScaled(sum)).toBe("0.3000");
  });
});

describe("quoting one lane", () => {
  it("charges the base and nothing more at exactly the base weight", () => {
    const result = quote(row(), { originZoneId: null, destinationZoneId: null, weight: "0.500" });

    expect(result.amount).toBe("80.0000");
    expect(result.explanation.additionalSteps).toBe(0);
  });

  it("charges a whole step for a consignment ten grams over", () => {
    // The rule every tariff states: a started step is a charged step. Rounding
    // down would undercharge every shipment by up to one step.
    const result = quote(row(), { originZoneId: null, destinationZoneId: null, weight: "0.510" });

    expect(result.explanation.additionalSteps).toBe(1);
    expect(result.amount).toBe("120.0000");
  });

  it("charges one step at exactly one step over, not two", () => {
    const result = quote(row(), { originZoneId: null, destinationZoneId: null, weight: "1.000" });

    expect(result.explanation.additionalSteps).toBe(1);
    expect(result.amount).toBe("120.0000");
  });

  it("prices a 5kg consignment the way the tariff reads", () => {
    // 500g at 80, then nine further 500g steps at 40 = 80 + 360.
    const result = quote(row(), { originZoneId: null, destinationZoneId: null, weight: "5.000" });

    expect(result.explanation.additionalSteps).toBe(9);
    expect(result.amount).toBe("440.0000");
  });

  it("lifts a cheap lane to its minimum", () => {
    const result = quote(row({ baseAmount: "20.0000", minimumAmount: "50.0000" }), {
      originZoneId: null,
      destinationZoneId: null,
      weight: "0.100",
    });

    expect(result.amount).toBe("50.0000");
    expect(result.explanation.minimumApplied).toBe(true);
  });

  it("does not apply the minimum once the weight has earned it", () => {
    const result = quote(row({ minimumAmount: "50.0000" }), {
      originZoneId: null,
      destinationZoneId: null,
      weight: "2.000",
    });

    expect(result.explanation.minimumApplied).toBe(false);
    expect(result.amount).toBe("200.0000");
  });

  it("refuses a step of zero rather than dividing by it", () => {
    expect(() =>
      quote(row({ additionalWeight: "0" }), {
        originZoneId: null,
        destinationZoneId: null,
        weight: "1.000",
      }),
    ).toThrow(/zero/);
  });

  it("keeps a fractional rate exact over many steps", () => {
    // 0.0001 per step, ten thousand steps: a float would drift here.
    const result = quote(
      row({ baseAmount: "0", baseWeight: "0", additionalWeight: "0.001", additionalAmount: "0.0001" }),
      { originZoneId: null, destinationZoneId: null, weight: "10.000" },
    );

    expect(result.explanation.additionalSteps).toBe(10_000);
    expect(result.amount).toBe("1.0000");
  });
});

describe("choosing a lane", () => {
  const specific = row({ originZoneId: "z1", destinationZoneId: "z2", baseAmount: "60.0000" });
  const halfway = row({ originZoneId: "z1", destinationZoneId: null, baseAmount: "70.0000" });
  const fallback = row();

  it("prefers the row naming both zones", () => {
    const chosen = selectRow([fallback, halfway, specific], {
      originZoneId: "z1",
      destinationZoneId: "z2",
      weight: "1",
    });

    expect(chosen?.baseAmount).toBe("60.0000");
  });

  it("falls back one level at a time", () => {
    const chosen = selectRow([fallback, halfway, specific], {
      originZoneId: "z1",
      destinationZoneId: "z9",
      weight: "1",
    });

    expect(chosen?.baseAmount).toBe("70.0000");
  });

  it("uses the catch-all when nothing else matches", () => {
    const chosen = selectRow([fallback, halfway, specific], {
      originZoneId: "z8",
      destinationZoneId: "z9",
      weight: "1",
    });

    expect(chosen?.baseAmount).toBe("80.0000");
  });

  it("returns nothing when the card cannot price the lane", () => {
    expect(selectRow([specific], { originZoneId: "z8", destinationZoneId: "z9", weight: "1" })).toBeUndefined();
  });
});

describe("choosing a card", () => {
  const card = (over: Partial<Card>): Card => ({
    id: "c",
    priority: 0,
    customerId: null,
    productId: null,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    rows: [],
    ...over,
  });

  it("ignores a card that is not yet in force", () => {
    const chosen = selectCard([card({ id: "future", effectiveFrom: "2026-06-01" })], "2026-03-01");
    expect(chosen).toBeUndefined();
  });

  it("ignores a card that has expired", () => {
    const chosen = selectCard(
      [card({ id: "old", effectiveTo: "2026-02-28" })],
      "2026-03-01",
    );
    expect(chosen).toBeUndefined();
  });

  it("prices an old shipment with the card that was in force then", () => {
    // An invoice re-run in September for an April consignment must reach the
    // April price, not today's.
    const april = card({ id: "april", effectiveFrom: "2026-04-01", effectiveTo: "2026-04-30" });
    const current = card({ id: "current", effectiveFrom: "2026-05-01" });

    expect(selectCard([april, current], "2026-04-15")?.id).toBe("april");
    expect(selectCard([april, current], "2026-09-15")?.id).toBe("current");
  });

  it("prefers a customer's own card over the standard tariff", () => {
    const standard = card({ id: "standard" });
    const theirs = card({ id: "theirs", customerId: "cust-1" });

    expect(selectCard([standard, theirs], "2026-06-01", { customerId: "cust-1" })?.id).toBe("theirs");
    expect(selectCard([standard, theirs], "2026-06-01", { customerId: "cust-2" })?.id).toBe("standard");
  });

  it("breaks a tie on priority, then on the later start", () => {
    const low = card({ id: "low", priority: 1 });
    const high = card({ id: "high", priority: 5 });
    expect(selectCard([low, high], "2026-06-01")?.id).toBe("high");

    const older = card({ id: "older", effectiveFrom: "2026-01-01" });
    const newer = card({ id: "newer", effectiveFrom: "2026-05-01" });
    expect(selectCard([older, newer], "2026-06-01")?.id).toBe("newer");
  });

  it("does not let a product card price a different product", () => {
    const forAir = card({ id: "air", productId: "p-air" });
    expect(selectCard([forAir], "2026-06-01", { productId: "p-surface" })).toBeUndefined();
  });
});
