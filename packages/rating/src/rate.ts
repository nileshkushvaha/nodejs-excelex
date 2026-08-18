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

export interface RateRow {
  /** Null means the row applies to any zone on that side. */
  readonly originZoneId: string | null;
  readonly destinationZoneId: string | null;
  readonly baseWeight: string;
  readonly baseAmount: string;
  readonly additionalWeight: string;
  readonly additionalAmount: string;
  readonly minimumAmount: string | null;
}

export interface Consignment {
  readonly originZoneId: string | null;
  readonly destinationZoneId: string | null;
  /** Chargeable weight in kilograms, already the greater of actual and volumetric. */
  readonly weight: string;
}

export interface Quote {
  readonly amount: string;
  /** How it was reached, so an invoice query has an answer. */
  readonly explanation: {
    readonly baseWeight: string;
    readonly baseAmount: string;
    readonly additionalSteps: number;
    readonly additionalAmount: string;
    readonly minimumApplied: boolean;
  };
}

/**
 * The most specific row that covers a lane.
 *
 * A row naming both zones beats one naming a single zone, which beats the
 * catch-all. Without an order, a card with a specific lane and a fallback
 * would price by whichever row the database returned first.
 */
export function selectRow(rows: readonly RateRow[], consignment: Consignment): RateRow | undefined {
  const matches = rows.filter(
    (row) =>
      (row.originZoneId === null || row.originZoneId === consignment.originZoneId) &&
      (row.destinationZoneId === null || row.destinationZoneId === consignment.destinationZoneId),
  );

  const specificity = (row: RateRow) =>
    (row.originZoneId === null ? 0 : 1) + (row.destinationZoneId === null ? 0 : 1);

  return matches.sort((a, b) => specificity(b) - specificity(a))[0];
}

/**
 * Prices one consignment against one row.
 *
 * The rule is the one every Indian courier tariff states: a base weight for a
 * base amount, then a whole step charged for every started step above it. A
 * consignment 10 grams over its base pays a full additional step, because
 * that is what the tariff says and what the customer was quoted — rounding it
 * down would undercharge every shipment by up to one step.
 */
export function quote(row: RateRow, consignment: Consignment): Quote {
  const weight = toScaled(consignment.weight);
  const baseWeight = toScaled(row.baseWeight);
  const baseAmount = toScaled(row.baseAmount);
  const stepWeight = toScaled(row.additionalWeight);
  const stepAmount = toScaled(row.additionalAmount);

  if (stepWeight <= 0n) {
    throw new Error("An additional weight step of zero cannot price anything.");
  }

  let steps = 0n;
  if (weight > baseWeight) {
    const over = weight - baseWeight;
    // Ceiling division: a started step is a charged step.
    steps = (over + stepWeight - 1n) / stepWeight;
  }

  const computed = baseAmount + steps * stepAmount;
  const minimum = row.minimumAmount === null ? 0n : toScaled(row.minimumAmount);
  const amount = computed < minimum ? minimum : computed;

  return {
    amount: fromScaled(amount),
    explanation: {
      baseWeight: row.baseWeight,
      baseAmount: row.baseAmount,
      additionalSteps: Number(steps),
      additionalAmount: fromScaled(steps * stepAmount),
      minimumApplied: computed < minimum,
    },
  };
}

export interface Card {
  readonly id: string;
  readonly priority: number;
  readonly customerId: string | null;
  readonly productId: string | null;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly rows: readonly RateRow[];
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
export function selectCard(
  cards: readonly Card[],
  on: string,
  context: { customerId?: string | null; productId?: string | null } = {},
): Card | undefined {
  const applicable = cards.filter((card) => {
    if (card.effectiveFrom > on) return false;
    if (card.effectiveTo !== null && card.effectiveTo < on) return false;
    if (card.customerId !== null && card.customerId !== context.customerId) return false;
    if (card.productId !== null && card.productId !== context.productId) return false;
    return true;
  });

  return applicable.sort((a, b) => {
    const customer = Number(b.customerId !== null) - Number(a.customerId !== null);
    if (customer !== 0) return customer;

    const product = Number(b.productId !== null) - Number(a.productId !== null);
    if (product !== 0) return product;

    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.effectiveFrom.localeCompare(a.effectiveFrom);
  })[0];
}
