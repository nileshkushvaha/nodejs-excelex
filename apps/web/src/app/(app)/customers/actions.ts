"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { apiMutate, type ActionResult } from "@/lib/api";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const nullable = (form: FormData, name: string) => text(form, name) || null;
const flag = (form: FormData, name: string) => form.get(name) === "on";

/**
 * One customer.
 *
 * Every field is read explicitly rather than looped over the FormData. It is
 * longer, but a typo in an input name then fails to save that field instead
 * of silently posting a key the server drops.
 */
export async function saveCustomer(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const id = text(form, "id");

  const body = {
    code: text(form, "code"),
    name: text(form, "name"),
    contactPerson: nullable(form, "contactPerson"),
    addressLine1: nullable(form, "addressLine1"),
    addressLine2: nullable(form, "addressLine2"),
    pinCode: nullable(form, "pinCode"),
    city: nullable(form, "city"),
    stateCode: nullable(form, "stateCode"),
    countryCode: text(form, "countryCode") || "IN",
    telephone1: nullable(form, "telephone1"),
    telephone2: nullable(form, "telephone2"),
    fax: nullable(form, "fax"),
    email: nullable(form, "email"),
    mobile: nullable(form, "mobile"),
    billingStateCode: nullable(form, "billingStateCode"),
    serviceCentreId: nullable(form, "serviceCentreId"),
    originId: nullable(form, "originId"),
    branchId: nullable(form, "branchId"),
    startDate: nullable(form, "startDate"),
    gstin: nullable(form, "gstin"),
    aadhaar: nullable(form, "aadhaar"),
    aadhaarDob: nullable(form, "aadhaarDob"),
    passportNo: nullable(form, "passportNo"),
    pan: nullable(form, "pan"),
    tan: nullable(form, "tan"),
    invoiceFormat: nullable(form, "invoiceFormat"),
    customerType: text(form, "customerType") || "CUSTOMER",
    registerType: text(form, "registerType") || "REGISTERED",

    paymentType: text(form, "paymentType") || "CREDIT",
    billingType: nullable(form, "billingType"),
    contractAmount: nullable(form, "contractAmount"),
    creditDays: Number(text(form, "creditDays") || 0),
    registrationNo: nullable(form, "registrationNo"),
    instructions: nullable(form, "instructions"),
    roundRupee: nullable(form, "roundRupee"),
    roundPaisa: nullable(form, "roundPaisa"),
    contractHead: nullable(form, "contractHead"),
    ledgerHead: nullable(form, "ledgerHead"),
    contractOrigin: nullable(form, "contractOrigin"),
    businessChannel: nullable(form, "businessChannel"),
    iecNo: nullable(form, "iecNo"),
    bankAdCode: nullable(form, "bankAdCode"),
    bankAccount: nullable(form, "bankAccount"),
    bankIfsc: nullable(form, "bankIfsc"),
    firm: nullable(form, "firm"),
    shipperType: nullable(form, "shipperType"),
    lutNumber: nullable(form, "lutNumber"),
    lutIssueDate: nullable(form, "lutIssueDate"),
    lutTillDate: nullable(form, "lutTillDate"),
    nfei: flag(form, "nfei"),
    fuelSurcharge: flag(form, "fuelSurcharge"),
    taxApplicable: flag(form, "taxApplicable"),
    noTariff: flag(form, "noTariff"),
    inclusiveTax: flag(form, "inclusiveTax"),

    contractNo: nullable(form, "contractNo"),
    contractStartDate: nullable(form, "contractStartDate"),
    contractEndDate: nullable(form, "contractEndDate"),
    creditLimit: nullable(form, "creditLimit"),
    securityDeposit: nullable(form, "securityDeposit"),
    contractNotes: nullable(form, "contractNotes"),

    salesExecutiveId: nullable(form, "salesExecutiveId"),
    incentiveType: text(form, "incentiveType") || "PERCENTAGE",
    incentivePercent: nullable(form, "incentivePercent"),
    customerMessage: nullable(form, "customerMessage"),
    accountEmail: nullable(form, "accountEmail"),
    bestRate: nullable(form, "bestRate"),
    monthlySales: nullable(form, "monthlySales"),
    defaultVendor: nullable(form, "defaultVendor"),
    area: nullable(form, "area"),
    industry: nullable(form, "industry"),
    globalCustomer: flag(form, "globalCustomer"),
    measurementUnit: text(form, "measurementUnit") || "CENTIMETER",
    geoLocation: nullable(form, "geoLocation"),
    disableCustomerOrigin: flag(form, "disableCustomerOrigin"),
    enableTaxDutiesPaidBy: flag(form, "enableTaxDutiesPaidBy"),
    enableAwbNo: flag(form, "enableAwbNo"),

    eStatement: flag(form, "eStatement"),
    eInvoice: flag(form, "eInvoice"),
    allowZeroAmount: flag(form, "allowZeroAmount"),
    isActive: flag(form, "isActive"),
  };

  const result = id
    ? await apiMutate(`/api/v1/masters/customers/${id}`, "PUT", body)
    : await apiMutate("/api/v1/masters/customers", "POST", body);

  if (!result.ok) return result;

  revalidatePath("/customers");

  // A new customer goes to its own page rather than back to the list: the
  // four rate tabs are the reason it was created, and they need an id.
  const created = id ? null : (result.data as { id?: string } | undefined)?.id;
  // Outside any try/catch: redirect() signals by throwing, and swallowing it
  // would leave the user on a form that has already saved.
  redirect(created ? `/customers/${created}` : "/customers");
}

export async function deleteCustomer(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/masters/customers/${text(form, "id")}`, "DELETE");
  if (!result.ok) return result;

  revalidatePath("/customers");
  return { ok: true };
}
