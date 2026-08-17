import type { ChargeCalculationBase, ChargeType } from "@/lib/api";

/** The four ledgers a charge can belong to. */
export const CHARGE_TYPES: ReadonlyArray<{ value: ChargeType; label: string }> = [
  { value: "AIRWAYBILL", label: "Airwaybill" },
  { value: "EXPENSE", label: "Expense" },
  { value: "INCOME", label: "Income" },
  { value: "PURCHASE", label: "Purchase" },
];

/**
 * What a rate multiplies, in the order the legacy screen lists them —
 * alphabetical by label, which is not the order the enum is declared in.
 */
export const CALCULATION_BASES: ReadonlyArray<{ value: ChargeCalculationBase; label: string }> = [
  { value: "ACTUAL_WEIGHT", label: "Actual Weight" },
  { value: "CHARGE_WEIGHT", label: "Charge Weight" },
  { value: "COD_AMOUNT", label: "COD Amount" },
  { value: "COMMERCIAL", label: "Commercial" },
  { value: "FLAT", label: "FLAT" },
  { value: "FREIGHT", label: "Freight" },
  { value: "ODA", label: "ODA" },
  { value: "ODA1", label: "ODA1" },
  { value: "ODA2", label: "ODA2" },
  { value: "ODA3", label: "ODA3" },
  { value: "PIECES", label: "Pieces" },
  { value: "POINT", label: "POINT" },
  { value: "SHIPMENT_VALUE", label: "Shipment Value" },
];

export const chargeTypeLabel = (value: ChargeType) =>
  CHARGE_TYPES.find((entry) => entry.value === value)?.label ?? value;

export const calculationBaseLabel = (value: ChargeCalculationBase) =>
  CALCULATION_BASES.find((entry) => entry.value === value)?.label ?? value;
