"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, type ActionResult } from "@/lib/api";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const nullable = (form: FormData, name: string) => text(form, name) || null;
const flag = (form: FormData, name: string) => form.get(name) === "on";

/**
 * The four child lists save through here.
 *
 * One action per kind rather than one generic one: the bodies differ, and a
 * single action taking a "kind" would need a switch that is exactly these
 * four functions with more ceremony around it.
 *
 * None of them redirect. The row is added to a list the user is already
 * looking at, and sending them elsewhere to confirm it worked would be worse
 * than showing it appear.
 */
async function save(path: string, id: string | null, body: unknown): Promise<ActionResult> {
  const result = id
    ? await apiMutate(`${path}/${id}`, "PUT", body)
    : await apiMutate(path, "POST", body);
  if (result.ok) revalidatePath(path.replace("/api/v1/masters", ""));
  return result;
}

export async function saveFuelSurcharge(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const customerId = text(form, "customerId");
  return save(`/api/v1/masters/customers/${customerId}/fuel-surcharges`, nullable(form, "id"), {
    fromDate: text(form, "fromDate"),
    toDate: text(form, "toDate"),
    vendor: nullable(form, "vendor"),
    productId: nullable(form, "productId"),
    destinationId: nullable(form, "destinationId"),
    service: nullable(form, "service"),
    percentage: text(form, "percentage") || "0",
  });
}

export async function saveCustomerCharge(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const customerId = text(form, "customerId");
  return save(`/api/v1/masters/customers/${customerId}/charges`, nullable(form, "id"), {
    chargeId: text(form, "chargeId"),
    fromDate: text(form, "fromDate"),
    toDate: text(form, "toDate"),
    vendor: nullable(form, "vendor"),
    service: nullable(form, "service"),
    productId: nullable(form, "productId"),
    originId: nullable(form, "originId"),
    destinationId: nullable(form, "destinationId"),
    valueType: text(form, "valueType") || "AMOUNT",
    value: text(form, "value") || "0",
    minimumValue: nullable(form, "minimumValue"),
  });
}

export async function saveVolumetric(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const customerId = text(form, "customerId");
  return save(`/api/v1/masters/customers/${customerId}/volumetrics`, nullable(form, "id"), {
    productId: nullable(form, "productId"),
    vendor: nullable(form, "vendor"),
    service: nullable(form, "service"),
    cft: text(form, "cft") || "0",
    centimetreDivide: text(form, "centimetreDivide") || "0",
    inchDivide: text(form, "inchDivide") || "0",
  });
}

export async function saveContact(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const customerId = text(form, "customerId");
  return save(`/api/v1/masters/customers/${customerId}/contacts`, nullable(form, "id"), {
    contactType: text(form, "contactType"),
    fromDate: text(form, "fromDate"),
    name: text(form, "name"),
    designation: nullable(form, "designation"),
    email: nullable(form, "email"),
    mobile: text(form, "mobile"),
    landline: nullable(form, "landline"),
    extension: nullable(form, "extension"),
    addressLine1: nullable(form, "addressLine1"),
    addressLine2: nullable(form, "addressLine2"),
    addressLine3: nullable(form, "addressLine3"),
    pinCode: text(form, "pinCode"),
    city: nullable(form, "city"),
    stateCode: nullable(form, "stateCode"),
    countryCode: text(form, "countryCode") || "IN",
    remark: nullable(form, "remark"),
    passportNo: nullable(form, "passportNo"),
    aadhaar: nullable(form, "aadhaar"),
    gstin: nullable(form, "gstin"),
    pan: nullable(form, "pan"),
    iecNo: nullable(form, "iecNo"),
    adCode: nullable(form, "adCode"),
    lutNo: nullable(form, "lutNo"),
    defaultShipper: flag(form, "defaultShipper"),
  });
}

/** Removes one child row. `kind` is the path segment, so it cannot drift. */
export async function deleteDetail(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const customerId = text(form, "customerId");
  const kind = text(form, "kind");
  const id = text(form, "id");

  const result = await apiMutate(`/api/v1/masters/customers/${customerId}/${kind}/${id}`, "DELETE");
  if (result.ok) revalidatePath(`/customers/${customerId}`);
  return result;
}
