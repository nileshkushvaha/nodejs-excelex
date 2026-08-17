import type { Prisma } from "@prisma/client";

interface ChargeSeed {
  code: string;
  name: string;
  /**
   * What the rate multiplies. Left out where the live screen did not show it —
   * those rows seed as FLAT and are worth checking against the source system
   * before anyone prices against them.
   */
  base?: Prisma.ChargeCreateInput["calculationBase"];
}

/**
 * The eighteen charges the live ExcelEx system carries.
 *
 * Codes and names are verbatim, typos included ("INFRA DEVELPOMENT"), because
 * they are what appears on existing invoices and what an import file will key
 * against. Correcting them is an edit the client makes, not one a seed makes
 * on their behalf.
 *
 * Every row on the live screen showed fuel, tax-on-fuel and tax as Yes, so all
 * three seed on. A charge that should not attract fuel is a change of one
 * toggle; a charge that silently does not is a wrong invoice.
 */
export const CHARGES: readonly ChargeSeed[] = [
  { code: "APT", name: "APPOINTMENT DELIVERY", base: "FLAT" },
  { code: "ATT", name: "Re Attempt", base: "ACTUAL_WEIGHT" },
  { code: "AWB", name: "AIRWAYBILL CHARGES", base: "FLAT" },
  { code: "CAF", name: "CURRENCY ADJUSTMENT FACTOR", base: "FREIGHT" },
  { code: "DEM", name: "DEMMURAGE CHARGE", base: "ACTUAL_WEIGHT" },
  { code: "DOD", name: "CHEQUE/DD ON DELIVERY", base: "SHIPMENT_VALUE" },
  { code: "ECC", name: "ENVIRONMENTAL SURCHARGE", base: "FLAT" },
  { code: "EDL", name: "EXTRA DELIVERY LOCATION", base: "ODA" },
  { code: "ESS", name: "Emergency Sit. Surhrg.", base: "FREIGHT" },
  { code: "FOV", name: "FREIGHT ON VALUE", base: "SHIPMENT_VALUE" },
  // Base not visible on the screen these came from.
  { code: "FRT", name: "Freight" },
  { code: "IDC", name: "INFRA DEVELPOMENT" },
  { code: "OSP", name: "OVER SIZE PCS" },
  { code: "PKG", name: "PACKAGING CHARGE" },
  { code: "PIK", name: "PICKUP CHARGES" },
  { code: "RAS", name: "RAS CHARGE" },
  { code: "TPY", name: "TOPAY CHARGES" },
  { code: "VCH", name: "VALUABLE CARGO HANDLING CHARGE" },
];

/**
 * Seeds a client's starting charges.
 *
 * Creates what is missing and leaves the rest alone, like the other
 * client-scoped seeds: re-running must not undo a rate somebody has set.
 *
 * Must be called inside a transaction that has already sealed the client
 * context.
 */
export async function seedCharges(
  tx: Prisma.TransactionClient,
  clientId: string,
): Promise<{ charges: number }> {
  let charges = 0;

  for (const [index, charge] of CHARGES.entries()) {
    const existing = await tx.charge.findFirst({
      where: { code: charge.code, deletedAt: null },
    });
    if (existing) continue;

    await tx.charge.create({
      data: {
        clientId,
        code: charge.code,
        name: charge.name,
        calculationBase: charge.base ?? "FLAT",
        applyFuel: true,
        applyTaxOnFuel: true,
        applyTax: true,
        // Alphabetical by code, which is the order the live list is in. Ten-step
        // gaps leave room to slot a charge between two without renumbering.
        sequence: (index + 1) * 10,
      },
    });
    charges += 1;
  }

  return { charges };
}
