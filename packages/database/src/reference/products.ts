import type { Prisma } from "@prisma/client";

/**
 * Product masters, seeded from the live ExcelEx product list.
 *
 * A note on the naming. The legacy application calls two different things
 * "Product Type": what kind of movement a product is (Domestic, International,
 * Local, Import) and how it travels (Air, Surface, Train, All). They are
 * separate masters here — ProductType and ProductGroup — because one answers
 * "where does this go" and the other "how does it get there", and a shipment
 * needs both answers.
 */

export const PRODUCT_TYPES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "DOM", name: "Domestic" },
  { code: "INT", name: "International" },
  { code: "LOC", name: "Local" },
  { code: "IMP", name: "Import" },
];

export const PRODUCT_GROUPS: ReadonlyArray<{ code: string; name: string }> = [
  { code: "AIR", name: "Air" },
  { code: "SFC", name: "Surface" },
  { code: "TRN", name: "Train" },
  { code: "ALL", name: "All" },
];

interface ProductSeed {
  code: string;
  name: string;
  type: string;
  /** DOX where the product carries documents, NDOX otherwise. */
  dox?: boolean;
  service?: string;
  /** All-inclusive quotes must not attract the fuel surcharge on top. */
  fuelCharge?: boolean;
}

/**
 * The live product list.
 *
 * DOX is set from the product's own meaning rather than from its type: "DOX —
 * International Document" and "SPX — International Non Document" are the same
 * type and differ only here, which is exactly why the flag lives on the product.
 *
 * Port-to-port products are quoted inclusive and carry no fuel surcharge.
 */
export const PRODUCTS: readonly ProductSeed[] = [
  { code: "APEX", name: "Air Cargo", type: "DOM" },
  { code: "DOD", name: "Cheque / DD on Delivery", type: "DOM", service: "SELF" },
  { code: "DOX", name: "International Document", type: "INT", dox: true },
  { code: "DP", name: "Domestic Courier", type: "DOM" },
  { code: "IDOX", name: "International Import Document", type: "IMP", dox: true },
  { code: "IPORT", name: "International Port to Port", type: "INT", fuelCharge: false },
  { code: "ISHIP", name: "International Import Ship Cargo", type: "IMP" },
  { code: "ISPX", name: "International Import Non Document", type: "IMP" },
  { code: "NDD", name: "Domestic Critical", type: "DOM" },
  { code: "PORT", name: "Domestic Port to Port", type: "DOM", fuelCharge: false },
  { code: "SFC", name: "Surface", type: "DOM" },
  { code: "SHIP", name: "International Ship Cargo", type: "INT" },
  { code: "SPX", name: "International Non Document", type: "INT" },
  { code: "TAPEX", name: "Domestic Reverse Apex", type: "DOM" },
  { code: "TDD", name: "Domestic Time Definite", type: "DOM" },
  { code: "TOSFC", name: "Domestic Reverse Surface", type: "DOM" },
  { code: "XSE", name: "DTDC Premium", type: "DOM", service: "SELF" },
];

/**
 * Seeds product masters for one client.
 *
 * Creates only what is missing, like the other client-scoped seeds: this is a
 * starting point, and re-running it must not undo a client's own edits. Must be
 * called inside a transaction that has already sealed the client context.
 */
export async function seedProductMasters(
  tx: Prisma.TransactionClient,
  clientId: string,
): Promise<{ types: number; groups: number; products: number }> {
  let types = 0;
  let groups = 0;
  let products = 0;

  const typeIds = new Map<string, string>();

  for (const type of PRODUCT_TYPES) {
    const existing = await tx.productType.findFirst({
      where: { code: type.code, deletedAt: null },
    });
    if (existing) {
      typeIds.set(type.code, existing.id);
      continue;
    }

    const row = await tx.productType.create({
      data: { clientId, code: type.code, name: type.name },
    });
    typeIds.set(type.code, row.id);
    types += 1;
  }

  for (const group of PRODUCT_GROUPS) {
    const existing = await tx.productGroup.findFirst({
      where: { code: group.code, deletedAt: null },
    });
    if (existing) continue;

    await tx.productGroup.create({ data: { clientId, code: group.code, name: group.name } });
    groups += 1;
  }

  for (const product of PRODUCTS) {
    const existing = await tx.product.findFirst({
      where: { code: product.code, deletedAt: null },
    });
    if (existing) continue;

    await tx.product.create({
      data: {
        clientId,
        code: product.code,
        name: product.name,
        productTypeId: typeIds.get(product.type) ?? null,
        service: product.service ?? null,
        contentKind: product.dox ? "DOX" : "NDOX",
        fuelCharge: product.fuelCharge ?? true,
      },
    });
    products += 1;
  }

  return { types, groups, products };
}
