/**
 * What a consignment costs, from a rate card.
 *
 * Pure functions over plain data: no database, no request, no Prisma. That is
 * deliberate and it is the same reason packages/permissions is pure — the
 * interesting failures in pricing are arithmetic and precedence, not queries,
 * and those are only testable in isolation.
 *
 * Money is a string end to end. It arrives as a string from the API, is
 * computed here in integer paise, and leaves as a string. No value in this
 * file is ever a JavaScript number with a fraction: 0.1 + 0.2 is not 0.3, and
 * an invoice is the last place to discover that.
 */

/** Four decimal places, matching numeric(14,4) in the database. */
const SCALE = 10_000n;

/** Parses a decimal string into scaled integer units. Throws on nonsense. */
export function toScaled(value: string): bigint {
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`"${value}" is not a decimal number.`);
  }

  const negative = trimmed.startsWith("-");
  const [whole, fraction = ""] = trimmed.replace("-", "").split(".");
  // Padded and cut to exactly four places, so 1.5 and 1.5000 are one value
  // and 1.00005 cannot round its way into a different one silently.
  const padded = (fraction + "0000").slice(0, 4);
  const scaled = BigInt(whole!) * SCALE + BigInt(padded);

  return negative ? -scaled : scaled;
}

/** Back to a decimal string, with all four places kept. */
export function fromScaled(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE).toString().padStart(4, "0");

  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/**
 * How one line of a tariff is read.
 *
 * These five are the client's own, taken from their rate file rather than
 * invented. What each means is stated here because a tariff is a contract
 * before it is an algorithm, and the person checking an invoice is reading
 * this list, not the code below it.
 */
export type RateLineType = "UPTO" | "INITIAL" | "ADDITIONAL" | "PLUS" | "PLUSKG";

export interface RateLine {
  readonly lineType: RateLineType;
  /** The weight the line applies at, in the card's own unit. */
  readonly weight: string;
  readonly rate: string;
}

export interface Consignment {
  /** Chargeable weight, already the greater of actual and volumetric. */
  readonly weight: string;
}

export interface Quote {
  readonly amount: string;
  /** Every line that contributed, so an invoice query has an answer. */
  readonly workings: ReadonlyArray<{
    readonly lineType: RateLineType;
    readonly weight: string;
    readonly rate: string;
    readonly amount: string;
    readonly note: string;
  }>;
}

/**
 * Prices one consignment against one tariff.
 *
 * The order is the order a tariff is read in:
 *
 *   1. UPTO — a flat charge for anything at or below its weight. The lowest
 *      one that covers the consignment wins, and it ends the calculation:
 *      "up to 500g is ₹80" means ₹80, not ₹80 plus slabs.
 *   2. INITIAL — the first slab. Its weight is included in its rate.
 *   3. ADDITIONAL — each further slab of its weight. A started slab is a
 *      charged slab, because that is what the tariff says and what the
 *      customer was quoted; rounding down would undercharge every shipment.
 *   4. PLUS and PLUSKG — charged above their threshold, once or per kilogram.
 *
 * Everything is computed in scaled integers. No value here is ever a
 * JavaScript number with a fraction: 0.1 + 0.2 is not 0.3, and an invoice is
 * the last place to find that out.
 */
export function quote(lines: readonly RateLine[], consignment: Consignment): Quote {
  const weight = toScaled(consignment.weight);
  const workings: Array<{
    lineType: RateLineType;
    weight: string;
    rate: string;
    amount: string;
    note: string;
  }> = [];

  const of = (type: RateLineType) =>
    lines
      .filter((line) => line.lineType === type)
      .sort((a, b) => (toScaled(a.weight) < toScaled(b.weight) ? -1 : 1));

  // 1. A flat charge that covers the whole consignment ends the matter.
  const upto = of("UPTO").find((line) => weight <= toScaled(line.weight));
  if (upto) {
    workings.push({
      lineType: "UPTO",
      weight: upto.weight,
      rate: upto.rate,
      amount: fromScaled(toScaled(upto.rate)),
      note: `Flat charge up to ${upto.weight}`,
    });
    return { amount: fromScaled(toScaled(upto.rate)), workings };
  }

  let total = 0n;

  // 2. The first slab, whose weight is included in its rate.
  const initial = of("INITIAL")[0];
  let covered = 0n;
  if (initial) {
    total += toScaled(initial.rate);
    covered = toScaled(initial.weight);
    workings.push({
      lineType: "INITIAL",
      weight: initial.weight,
      rate: initial.rate,
      amount: initial.rate,
      note: `First ${initial.weight}`,
    });
  }

  // 3. Repeating slabs above it.
  const additional = of("ADDITIONAL")[0];
  if (additional && weight > covered) {
    const step = toScaled(additional.weight);
    if (step <= 0n) throw new Error("An ADDITIONAL line with a weight of zero cannot price anything.");

    // Ceiling division: a started slab is a charged slab.
    const steps = (weight - covered + step - 1n) / step;
    const amount = steps * toScaled(additional.rate);
    total += amount;
    workings.push({
      lineType: "ADDITIONAL",
      weight: additional.weight,
      rate: additional.rate,
      amount: fromScaled(amount),
      note: `${steps} × ${additional.weight} above ${fromScaled(covered)}`,
    });
  }

  // 4. Anything charged for being over a threshold.
  for (const line of of("PLUS")) {
    if (weight <= toScaled(line.weight)) continue;
    total += toScaled(line.rate);
    workings.push({
      lineType: "PLUS",
      weight: line.weight,
      rate: line.rate,
      amount: line.rate,
      note: `Above ${line.weight}`,
    });
  }

  for (const line of of("PLUSKG")) {
    const threshold = toScaled(line.weight);
    if (weight <= threshold) continue;

    // Per kilogram of excess, rounded up: a part kilogram is a charged one,
    // for the same reason a started slab is.
    const excessKg = (weight - threshold + SCALE - 1n) / SCALE;
    const amount = excessKg * toScaled(line.rate);
    total += amount;
    workings.push({
      lineType: "PLUSKG",
      weight: line.weight,
      rate: line.rate,
      amount: fromScaled(amount),
      note: `${excessKg}kg above ${line.weight}`,
    });
  }

  return { amount: fromScaled(total), workings };
}

export interface Card {
  readonly id: string;
  readonly priority: number;
  readonly customerId: string | null;
  readonly productId: string | null;
  readonly originId: string | null;
  readonly destinationId: string | null;
  readonly zoneId: string | null;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly lines: readonly RateLine[];
}

/** What a shipment is, for the purpose of choosing a tariff. */
export interface Lane {
  readonly customerId?: string | null;
  readonly productId?: string | null;
  readonly originId?: string | null;
  readonly destinationId?: string | null;
  readonly zoneId?: string | null;
}

/**
 * The card that applies to a shipment on a date.
 *
 * A card must be in force on the shipment's own date, not today's: an invoice
 * re-run in September for an April consignment must reach the April price.
 *
 * Precedence is customer, then product, then priority, then the most recently
 * effective. A customer's own card beating the standard tariff is the whole
 * reason customer cards exist, and it must not depend on the order rows come
 * back in.
 */
export function selectCard(cards: readonly Card[], on: string, lane: Lane = {}): Card | undefined {
  // A blank on the card means "any", which is how a standard tariff is
  // written. A value must match, or the card is not for this shipment.
  const matches = (cardValue: string | null, laneValue: string | null | undefined) =>
    cardValue === null || cardValue === laneValue;

  const applicable = cards.filter((card) => {
    if (card.effectiveFrom > on) return false;
    if (card.effectiveTo !== null && card.effectiveTo < on) return false;
    return (
      matches(card.customerId, lane.customerId) &&
      matches(card.productId, lane.productId) &&
      matches(card.originId, lane.originId) &&
      matches(card.destinationId, lane.destinationId) &&
      matches(card.zoneId, lane.zoneId)
    );
  });

  /**
   * The most specific tariff wins, counted by how many of its fields are
   * filled in. A rate written for one customer on one lane beats the standard
   * tariff; without this, a client with both would price by whichever row the
   * database happened to return first.
   */
  const specificity = (card: Card) =>
    [card.customerId, card.productId, card.originId, card.destinationId, card.zoneId].filter(
      (value) => value !== null,
    ).length;

  return applicable.sort((a, b) => {
    // A customer's own rate outranks anything general, however specific the
    // general one is: it is a negotiated price, not a better guess.
    const customer = Number(b.customerId !== null) - Number(a.customerId !== null);
    if (customer !== 0) return customer;

    if (specificity(b) !== specificity(a)) return specificity(b) - specificity(a);
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.effectiveFrom.localeCompare(a.effectiveFrom);
  })[0];
}
