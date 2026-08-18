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

/** Kilograms, or pounds, because a tariff may be written in either. */
export type WeightUnit = "KGS" | "LBS";

/** One pound in kilograms, to four places — the tariff scale. */
const KG_PER_LB = toScaledLiteral("0.4536");

function toScaledLiteral(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * SCALE + BigInt((fraction + "0000").slice(0, 4));
}

/**
 * Converts a weight into the unit its tariff is written in.
 *
 * A shipment is weighed once, on one scale, and priced against whichever
 * tariff applies — which may be quoted in pounds for an international lane
 * and kilograms for a domestic one. Pricing a kilogram weight against a pound
 * tariff without converting is wrong by a factor of 2.2, in the customer's
 * favour or ours depending on the direction, and neither is acceptable.
 */
export function convertWeight(weight: string, from: WeightUnit, to: WeightUnit): string {
  if (from === to) return fromScaled(toScaled(weight));

  const scaled = toScaled(weight);
  return from === "KGS"
    ? fromScaled((scaled * SCALE) / KG_PER_LB)
    : fromScaled((scaled * KG_PER_LB) / SCALE);
}

/**
 * The weight a consignment is charged on.
 *
 * The greater of what it weighs and what it takes up, which is the rule every
 * courier prices by: a box of pillows costs what its volume costs. The
 * divisor is negotiated per customer, which is why it is a parameter here and
 * a row in customer_volumetrics rather than a constant.
 *
 * A divisor of zero means "not agreed" rather than "divide by zero", so the
 * volumetric side is simply skipped.
 */
export function chargeableWeight(input: {
  actual: string;
  /** Centimetres, if the consignment was measured. */
  length?: string;
  width?: string;
  height?: string;
  /** The customer's agreed divisor. Zero or absent means not agreed. */
  divisor?: string;
}): string {
  const actual = toScaled(input.actual);
  if (!input.length || !input.width || !input.height || !input.divisor) return fromScaled(actual);

  const divisor = toScaled(input.divisor);
  if (divisor <= 0n) return fromScaled(actual);

  // Multiplied then divided in scaled space, so the intermediate cannot lose
  // precision the way (l*w*h)/d would in floating point.
  const volume = (toScaled(input.length) * toScaled(input.width)) / SCALE;
  const cubic = (volume * toScaled(input.height)) / SCALE;
  const volumetric = (cubic * SCALE) / divisor;

  return fromScaled(volumetric > actual ? volumetric : actual);
}

/** How a priced amount is rounded before it reaches an invoice. */
export type Rounding = "NONE" | "NEAREST" | "UP" | "DOWN";

/**
 * Rounds to whole currency units.
 *
 * Their rate import offers "Rate Round Off", and a tariff that prices to four
 * decimal places has to be told what to do with them before an invoice shows
 * ₹1,247.8331 to somebody who agreed to ₹1,248.
 */
export function round(amount: string, mode: Rounding): string {
  if (mode === "NONE") return fromScaled(toScaled(amount));

  const scaled = toScaled(amount);
  const whole = scaled / SCALE;
  const remainder = scaled % SCALE;
  if (remainder === 0n) return fromScaled(scaled);

  const up = whole + 1n;
  if (mode === "UP") return fromScaled(up * SCALE);
  if (mode === "DOWN") return fromScaled(whole * SCALE);
  return fromScaled((remainder >= SCALE / 2n ? up : whole) * SCALE);
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
export function quote(
  lines: readonly RateLine[],
  consignment: Consignment,
  options: {
    /** Charged once per airway bill, on top of the weight calculation. */
    awbCharge?: string | null;
    rounding?: Rounding;
  } = {},
): Quote {
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
    const flat = toScaled(upto.rate) + (options.awbCharge ? toScaled(options.awbCharge) : 0n);
    if (options.awbCharge) {
      workings.push({
        lineType: "PLUS",
        weight: "0.000",
        rate: options.awbCharge,
        amount: options.awbCharge,
        note: "Airway bill charge",
      });
    }
    return { amount: round(fromScaled(flat), options.rounding ?? "NONE"), workings };
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

  // Once per airway bill, not per slab — which is why it is on the card and
  // added here rather than being another line type.
  if (options.awbCharge) {
    const awb = toScaled(options.awbCharge);
    if (awb !== 0n) {
      total += awb;
      workings.push({
        lineType: "PLUS",
        weight: "0.000",
        rate: options.awbCharge,
        amount: options.awbCharge,
        note: "Airway bill charge",
      });
    }
  }

  const rounded = round(fromScaled(total), options.rounding ?? "NONE");
  if (rounded !== fromScaled(total)) {
    workings.push({
      lineType: "PLUS",
      weight: "0.000",
      rate: "0",
      amount: fromScaled(toScaled(rounded) - total),
      note: `Rounded ${options.rounding?.toLowerCase()}`,
    });
  }

  return { amount: rounded, workings };
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
