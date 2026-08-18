import { describe, expect, it } from "vitest";

import {
  fromScaled,
  quote,
  selectCard,
  toScaled,
  type Card,
  type RateLine,
} from "./rate";

const line = (lineType: RateLine["lineType"], weight: string, rate: string): RateLine => ({
  lineType,
  weight,
  rate,
});

describe("decimal handling", () => {
  it("adds money exactly where a float would not", () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point. This is why the module
    // works in scaled integers and never in numbers.
    expect(fromScaled(toScaled("0.1") + toScaled("0.2"))).toBe("0.3000");
  });

  it("refuses anything that is not a number", () => {
    for (const value of ["", "abc", "1.2.3", "1,200", "12px"]) {
      expect(() => toScaled(value)).toThrow();
    }
  });

  it("keeps four places, so 1.5 and 1.5000 are one value", () => {
    expect(fromScaled(toScaled("1.5"))).toBe(fromScaled(toScaled("1.5000")));
  });
});

describe("UPTO", () => {
  const lines = [line("UPTO", "0.500", "80"), line("UPTO", "1.000", "120"), line("INITIAL", "0.500", "80")];

  it("charges the flat rate and stops there", () => {
    // "Up to 500g is 80" means 80 — not 80 plus slabs on top.
    const result = quote(lines, { weight: "0.400" });

    expect(result.amount).toBe("80.0000");
    expect(result.workings).toHaveLength(1);
  });

  it("takes the lowest band that still covers the consignment", () => {
    expect(quote(lines, { weight: "0.900" }).amount).toBe("120.0000");
  });

  it("falls through to the slabs when nothing covers it", () => {
    const result = quote([...lines, line("ADDITIONAL", "0.500", "40")], { weight: "2.000" });
    expect(result.workings.map((w) => w.lineType)).toEqual(["INITIAL", "ADDITIONAL"]);
  });
});

describe("INITIAL and ADDITIONAL", () => {
  const lines = [line("INITIAL", "0.500", "80"), line("ADDITIONAL", "0.500", "40")];

  it("charges only the first slab at its own weight", () => {
    expect(quote(lines, { weight: "0.500" }).amount).toBe("80.0000");
  });

  it("charges a whole slab for ten grams over", () => {
    // A started slab is a charged slab: that is what the tariff says and what
    // the customer was quoted.
    expect(quote(lines, { weight: "0.510" }).amount).toBe("120.0000");
  });

  it("prices five kilograms the way the tariff reads", () => {
    // 500g at 80, then nine further 500g slabs at 40.
    const result = quote(lines, { weight: "5.000" });
    expect(result.amount).toBe("440.0000");
  });

  it("refuses an ADDITIONAL line of zero weight rather than dividing by it", () => {
    expect(() => quote([line("INITIAL", "0.5", "80"), line("ADDITIONAL", "0", "40")], { weight: "2" })).toThrow(
      /zero/,
    );
  });
});

describe("PLUS and PLUSKG", () => {
  const base = [line("INITIAL", "0.500", "80"), line("ADDITIONAL", "0.500", "40")];

  it("adds a PLUS charge once, above its threshold", () => {
    const result = quote([...base, line("PLUS", "10.000", "500")], { weight: "12.000" });

    // 80 + 23 slabs × 40 = 1000, plus the 500 surcharge.
    expect(result.amount).toBe("1500.0000");
    expect(result.workings.some((w) => w.lineType === "PLUS")).toBe(true);
  });

  it("does not add a PLUS charge at or below its threshold", () => {
    const result = quote([...base, line("PLUS", "10.000", "500")], { weight: "10.000" });
    expect(result.workings.some((w) => w.lineType === "PLUS")).toBe(false);
  });

  it("charges PLUSKG for every started kilogram of excess", () => {
    // 2.4kg over the threshold is three charged kilograms, for the same
    // reason a started slab is a charged slab.
    const result = quote([line("INITIAL", "10.000", "500"), line("PLUSKG", "10.000", "25")], {
      weight: "12.400",
    });

    expect(result.amount).toBe("575.0000");
  });
});

describe("choosing a tariff", () => {
  const card = (over: Partial<Card>): Card => ({
    id: "c",
    priority: 0,
    customerId: null,
    productId: null,
    originId: null,
    destinationId: null,
    zoneId: null,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    lines: [],
    ...over,
  });

  it("prices an old shipment with the tariff in force then", () => {
    // An invoice re-run in September for an April consignment must reach the
    // April price, not today's.
    const april = card({ id: "april", effectiveFrom: "2026-04-01", effectiveTo: "2026-04-30" });
    const current = card({ id: "current", effectiveFrom: "2026-05-01" });

    expect(selectCard([april, current], "2026-04-15")?.id).toBe("april");
    expect(selectCard([april, current], "2026-09-15")?.id).toBe("current");
  });

  it("lets a customer rate beat a more specific general one", () => {
    // A negotiated price is not a better guess at a general one; it wins.
    const generalLane = card({ id: "lane", originId: "o1", destinationId: "d1", zoneId: "z1" });
    const theirs = card({ id: "theirs", customerId: "cust-1" });

    const chosen = selectCard([generalLane, theirs], "2026-06-01", {
      customerId: "cust-1",
      originId: "o1",
      destinationId: "d1",
      zoneId: "z1",
    });

    expect(chosen?.id).toBe("theirs");
  });

  it("prefers the more specific of two general tariffs", () => {
    const broad = card({ id: "broad" });
    const lane = card({ id: "lane", originId: "o1", destinationId: "d1" });

    expect(selectCard([broad, lane], "2026-06-01", { originId: "o1", destinationId: "d1" })?.id).toBe("lane");
  });

  it("will not use a tariff written for another lane", () => {
    const other = card({ id: "other", originId: "o9" });
    expect(selectCard([other], "2026-06-01", { originId: "o1" })).toBeUndefined();
  });

  it("treats a blank on the card as any", () => {
    const standard = card({ id: "standard" });
    expect(selectCard([standard], "2026-06-01", { originId: "anything" })?.id).toBe("standard");
  });

  it("breaks a remaining tie on priority, then on the later start", () => {
    expect(
      selectCard([card({ id: "low", priority: 1 }), card({ id: "high", priority: 5 })], "2026-06-01")?.id,
    ).toBe("high");
    expect(
      selectCard(
        [card({ id: "older" }), card({ id: "newer", effectiveFrom: "2026-05-01" })],
        "2026-06-01",
      )?.id,
    ).toBe("newer");
  });
});
