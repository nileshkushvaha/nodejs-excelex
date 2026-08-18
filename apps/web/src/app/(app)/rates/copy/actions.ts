"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, type ActionResult } from "@/lib/api";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const nullable = (form: FormData, name: string) => text(form, name) || null;

export interface CopyReport {
  mode: "preview" | "commit";
  matched: number;
  created: number;
  replaced: number;
  lines: number;
  conflicts: string[];
  examples: Array<{ lane: string; before: string; after: string }>;
}

export type CopyResult = ActionResult & { report?: CopyReport };

/**
 * Previews or performs a bulk copy.
 *
 * The mode travels in the form, and preview is what the button does first.
 * This writes hundreds of rates in one call; the person pressing it should
 * see the count and three example prices before it happens.
 */
export async function copyRates(_previous: CopyResult | null, form: FormData): Promise<CopyResult> {
  const lane = (prefix: string) => ({
    customerId: nullable(form, `${prefix}CustomerId`),
    originId: nullable(form, `${prefix}OriginId`),
    destinationId: nullable(form, `${prefix}DestinationId`),
    productId: nullable(form, `${prefix}ProductId`),
    vendor: nullable(form, `${prefix}Vendor`),
    service: nullable(form, `${prefix}Service`),
  });

  const mode = text(form, "mode") === "commit" ? "commit" : "preview";

  const result = await apiMutate(`/api/v1/masters/rates/copy?mode=${mode}`, "POST", {
    from: { ...lane("from"), effectiveFrom: nullable(form, "fromEffectiveFrom") },
    to: { ...lane("to"), effectiveFrom: text(form, "toEffectiveFrom") },
    percentageIncrease: text(form, "percentageIncrease") || "0",
    rounding: text(form, "rounding") || "NONE",
  });

  if (!result.ok) return result;
  if (mode === "commit") revalidatePath("/rates");

  return { ok: true, report: result.data as CopyReport };
}
