"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, Form, FormError, formField } from "@/components/form-field";
import { FormActions, FormPanel } from "@/components/form-page";
import { Toggle } from "@/components/toggle";
import type { Customer, Destination, SalesExecutive, ServiceCentre, StateRow } from "@/lib/api";
import { saveCustomer } from "./actions";

type Option = { id: string; code: string; name: string };

/**
 * The customer record.
 *
 * The legacy screen is a five-step wizard. This is one form with five
 * sections, because the steps have no dependency on each other and five saves
 * of one record is five chances to lose the other four. Everything is
 * optional but the code and the name — a half-known customer taken down at
 * the counter is worth more than a rejected form.
 */
export function CustomerForm({
  customer,
  centres,
  destinations,
  states,
  executives,
  branches,
  canManage,
}: {
  customer: Customer | null;
  centres: ServiceCentre[];
  destinations: Destination[];
  states: StateRow[];
  executives: SalesExecutive[];
  branches: Option[];
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(saveCustomer, null);
  const value = (key: string) => (customer?.[key] ?? "") as string;
  const checked = (key: string, fallback = false) =>
    customer ? Boolean(customer[key]) : fallback;

  return (
    <Form errors={state?.fieldErrors} action={action} className="space-y-5">
      {customer ? <input type="hidden" name="id" value={customer.id} /> : null}
      <FormError result={state} />

      <FormPanel title="Personal details">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Code">
            <input
              name="code"
              required
              maxLength={20}
              pattern="[A-Za-z0-9\-]+"
              defaultValue={value("code")}
              placeholder="111146"
              className={`${formField} font-mono uppercase`}
            />
          </Field>
          <Field label="Name" span={2}>
            <input name="name" required minLength={2} maxLength={160} defaultValue={value("name")} className={formField} />
          </Field>
          <Field label="Contact person">
            <input name="contactPerson" maxLength={120} defaultValue={value("contactPerson")} className={formField} />
          </Field>

          <Field label="Address 1" span={2}>
            <input name="addressLine1" maxLength={200} defaultValue={value("addressLine1")} className={formField} />
          </Field>
          <Field label="Address 2" span={2}>
            <input name="addressLine2" maxLength={200} defaultValue={value("addressLine2")} className={formField} />
          </Field>

          <Field label="Pin code">
            <input name="pinCode" maxLength={12} defaultValue={value("pinCode")} className={formField} />
          </Field>
          <Field label="City">
            <input name="city" maxLength={80} defaultValue={value("city")} className={formField} />
          </Field>
          <Field label="State">
            <select name="stateCode" defaultValue={value("stateCode")} className={formField}>
              <option value="">—</option>
              {states.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Billing state" hint="Whose GST rules the invoice follows.">
            <select name="billingStateCode" defaultValue={value("billingStateCode")} className={formField}>
              <option value="">—</option>
              {states.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Telephone 1">
            <input name="telephone1" maxLength={40} defaultValue={value("telephone1")} className={formField} />
          </Field>
          <Field label="Telephone 2">
            <input name="telephone2" maxLength={40} defaultValue={value("telephone2")} className={formField} />
          </Field>
          <Field label="Mobile">
            <input name="mobile" maxLength={20} defaultValue={value("mobile")} className={formField} />
          </Field>
          <Field label="Fax">
            <input name="fax" maxLength={40} defaultValue={value("fax")} className={formField} />
          </Field>

          <Field label="Email" span={2} hint="Several addresses may be separated by semicolons.">
            <input name="email" maxLength={320} defaultValue={value("email")} placeholder="abc@xyz.com; mno@pqr.net" className={formField} />
          </Field>
          <Field label="Service centre">
            <select name="serviceCentreId" defaultValue={value("serviceCentreId")} className={formField}>
              <option value="">—</option>
              {centres.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Branch">
            <select name="branchId" defaultValue={value("branchId")} className={formField}>
              <option value="">—</option>
              {branches.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Origin">
            <select name="originId" defaultValue={value("originId")} className={formField}>
              <option value="">—</option>
              {destinations.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start date">
            <input type="date" name="startDate" defaultValue={value("startDate")} className={formField} />
          </Field>
          <Field label="Customer type">
            <select name="customerType" defaultValue={value("customerType") || "CUSTOMER"} className={formField}>
              <option value="CUSTOMER">Customer</option>
              <option value="CO_COURIER">Co-courier</option>
              <option value="FRANCHISEE">Franchisee</option>
            </select>
          </Field>
          <Field label="Register type">
            <select name="registerType" defaultValue={value("registerType") || "REGISTERED"} className={formField}>
              <option value="REGISTERED">Registered</option>
              <option value="UNREGISTERED">Un-registered</option>
              <option value="B2B">B2B</option>
              <option value="B2C">B2C</option>
            </select>
          </Field>

          <Field label="GST no.">
            <input name="gstin" maxLength={20} defaultValue={value("gstin")} className={`${formField} font-mono uppercase`} />
          </Field>
          <Field label="PAN no.">
            <input name="pan" maxLength={20} defaultValue={value("pan")} className={`${formField} font-mono uppercase`} />
          </Field>
          <Field label="TAN no.">
            <input name="tan" maxLength={20} defaultValue={value("tan")} className={`${formField} font-mono uppercase`} />
          </Field>
          <Field label="Aadhaar no.">
            <input name="aadhaar" maxLength={20} defaultValue={value("aadhaar")} className={`${formField} font-mono`} />
          </Field>

          <Field label="DOB on Aadhaar">
            <input type="date" name="aadhaarDob" defaultValue={value("aadhaarDob")} className={formField} />
          </Field>
          <Field label="Passport no.">
            <input name="passportNo" maxLength={20} defaultValue={value("passportNo")} className={formField} />
          </Field>
          <Field label="Invoice format" span={2}>
            <input name="invoiceFormat" maxLength={60} defaultValue={value("invoiceFormat")} className={formField} />
          </Field>
        </div>

        <div className="mt-4">
          <Toggle name="isActive" label="Active" defaultChecked={checked("isActive", true)} />
        </div>
      </FormPanel>

      <FormPanel title="Billing">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Payment type">
            <select name="paymentType" defaultValue={value("paymentType") || "CREDIT"} className={formField}>
              <option value="CASH">Cash</option>
              <option value="CHEQUE">Cheque</option>
              <option value="CREDIT">Credit</option>
              <option value="TOPAY">To pay</option>
            </select>
          </Field>
          <Field label="Billing type">
            <select name="billingType" defaultValue={value("billingType")} className={formField}>
              <option value="">—</option>
              <option value="ALL">All</option>
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="FORTNIGHTLY">Fortnightly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </Field>
          <Field label="Contract amount">
            <input name="contractAmount" inputMode="decimal" defaultValue={value("contractAmount")} className={`${formField} tabular-nums`} />
          </Field>
          <Field label="Credit days">
            <input type="number" name="creditDays" min={0} max={365} defaultValue={value("creditDays") || "0"} className={`${formField} tabular-nums`} />
          </Field>

          <Field label="Registration no.">
            <input name="registrationNo" maxLength={60} defaultValue={value("registrationNo")} className={formField} />
          </Field>
          <Field label="Round rupee">
            <input name="roundRupee" inputMode="decimal" defaultValue={value("roundRupee")} className={`${formField} tabular-nums`} />
          </Field>
          <Field label="Round paisa">
            <input name="roundPaisa" inputMode="decimal" defaultValue={value("roundPaisa")} className={`${formField} tabular-nums`} />
          </Field>
          <Field label="Business channel">
            <input name="businessChannel" maxLength={60} defaultValue={value("businessChannel")} className={formField} />
          </Field>

          <Field label="Contract head" hint="Free text until the accounts master exists.">
            <input name="contractHead" maxLength={120} defaultValue={value("contractHead")} className={formField} />
          </Field>
          <Field label="Ledger head">
            <input name="ledgerHead" maxLength={120} defaultValue={value("ledgerHead")} className={formField} />
          </Field>
          <Field label="Contract origin">
            <input name="contractOrigin" maxLength={120} defaultValue={value("contractOrigin")} className={formField} />
          </Field>
          <Field label="IEC no.">
            <input name="iecNo" maxLength={30} defaultValue={value("iecNo")} className={formField} />
          </Field>

          <Field label="Bank account">
            <input name="bankAccount" maxLength={40} defaultValue={value("bankAccount")} className={`${formField} font-mono`} />
          </Field>
          <Field label="Bank IFSC">
            <input name="bankIfsc" maxLength={20} defaultValue={value("bankIfsc")} className={`${formField} font-mono uppercase`} />
          </Field>
          <Field label="Bank AD code">
            <input name="bankAdCode" maxLength={30} defaultValue={value("bankAdCode")} className={formField} />
          </Field>
          <Field label="Firm">
            <select name="firm" defaultValue={value("firm")} className={formField}>
              <option value="">—</option>
              <option value="GOVT">Govt</option>
              <option value="NON_GOVT">Non-govt</option>
            </select>
          </Field>

          <Field label="Shipper type">
            <select name="shipperType" defaultValue={value("shipperType")} className={formField}>
              <option value="">—</option>
              <option value="INDIVIDUAL">Individual</option>
              <option value="MSME">MSME</option>
            </select>
          </Field>
          <Field label="LUT number">
            <input name="lutNumber" maxLength={40} defaultValue={value("lutNumber")} className={formField} />
          </Field>
          <Field label="LUT issue date">
            <input type="date" name="lutIssueDate" defaultValue={value("lutIssueDate")} className={formField} />
          </Field>
          <Field label="LUT till date">
            <input type="date" name="lutTillDate" defaultValue={value("lutTillDate")} className={formField} />
          </Field>

          <Field label="Instructions" span={4} hint="Printed on the invoice.">
            <textarea name="instructions" rows={2} maxLength={2000} defaultValue={value("instructions")} className={formField} />
          </Field>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Toggle name="fuelSurcharge" label="Fuel surcharge" defaultChecked={checked("fuelSurcharge", true)} />
          <Toggle name="taxApplicable" label="Tax" defaultChecked={checked("taxApplicable", true)} />
          <Toggle name="noTariff" label="No tariff" defaultChecked={checked("noTariff")} />
          <Toggle name="inclusiveTax" label="Inclusive tax" defaultChecked={checked("inclusiveTax")} />
          <Toggle name="nfei" label="NFEI" defaultChecked={checked("nfei")} />
        </div>
      </FormPanel>

      <FormPanel
        title="Contract"
        description="Empty in the legacy wizard. These are the terms that get argued over and then forgotten."
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Contract no.">
            <input name="contractNo" maxLength={60} defaultValue={value("contractNo")} className={formField} />
          </Field>
          <Field label="Starts">
            <input type="date" name="contractStartDate" defaultValue={value("contractStartDate")} className={formField} />
          </Field>
          <Field label="Ends">
            <input type="date" name="contractEndDate" defaultValue={value("contractEndDate")} className={formField} />
          </Field>
          <Field label="Credit limit" hint="Blank means no limit set.">
            <input name="creditLimit" inputMode="decimal" defaultValue={value("creditLimit")} className={`${formField} tabular-nums`} />
          </Field>
          <Field label="Security deposit">
            <input name="securityDeposit" inputMode="decimal" defaultValue={value("securityDeposit")} className={`${formField} tabular-nums`} />
          </Field>
          <Field label="Notes" span={3}>
            <input name="contractNotes" maxLength={2000} defaultValue={value("contractNotes")} className={formField} />
          </Field>
        </div>
      </FormPanel>

      <FormPanel title="Sales and other">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Sales executive">
            <select name="salesExecutiveId" defaultValue={value("salesExecutiveId")} className={formField}>
              <option value="">—</option>
              {executives.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Incentive type">
            <select name="incentiveType" defaultValue={value("incentiveType") || "PERCENTAGE"} className={formField}>
              <option value="PERCENTAGE">Percentage</option>
              <option value="INCENTIVE">Incentive</option>
              <option value="FIXED">Fixed</option>
            </select>
          </Field>
          <Field label="Incentive percent">
            <input name="incentivePercent" inputMode="decimal" defaultValue={value("incentivePercent") || "0"} className={`${formField} tabular-nums`} />
          </Field>
          <Field label="Monthly sales">
            <input name="monthlySales" inputMode="decimal" defaultValue={value("monthlySales")} className={`${formField} tabular-nums`} />
          </Field>

          <Field label="Account email" span={2}>
            <input name="accountEmail" maxLength={320} defaultValue={value("accountEmail")} className={formField} />
          </Field>
          <Field label="Best rate">
            <input name="bestRate" maxLength={120} defaultValue={value("bestRate")} className={formField} />
          </Field>
          <Field label="Default vendor">
            <input name="defaultVendor" maxLength={120} defaultValue={value("defaultVendor")} className={formField} />
          </Field>

          <Field label="Area">
            <input name="area" maxLength={120} defaultValue={value("area")} className={formField} />
          </Field>
          <Field label="Industry">
            <input name="industry" maxLength={120} defaultValue={value("industry")} className={formField} />
          </Field>
          <Field label="Measurement unit">
            <select name="measurementUnit" defaultValue={value("measurementUnit") || "CENTIMETER"} className={formField}>
              <option value="CENTIMETER">Centimeter</option>
              <option value="INCH">Inches</option>
            </select>
          </Field>
          <Field label="Geo location">
            <input name="geoLocation" maxLength={120} defaultValue={value("geoLocation")} className={formField} />
          </Field>

          <Field label="Customer message" span={4}>
            <input name="customerMessage" maxLength={500} defaultValue={value("customerMessage")} className={formField} />
          </Field>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Toggle name="globalCustomer" label="Global customer" defaultChecked={checked("globalCustomer")} />
          <Toggle name="disableCustomerOrigin" label="Disable customer origin" defaultChecked={checked("disableCustomerOrigin")} />
          <Toggle name="enableTaxDutiesPaidBy" label="Tax and duties paid by" defaultChecked={checked("enableTaxDutiesPaidBy")} />
          <Toggle name="enableAwbNo" label="Enable AWB no." defaultChecked={checked("enableAwbNo")} />
        </div>
      </FormPanel>

      <FormPanel title="Notification">
        <div className="grid gap-3 sm:grid-cols-3">
          <Toggle name="eStatement" label="E-statement" defaultChecked={checked("eStatement")} />
          <Toggle name="eInvoice" label="E-invoice" defaultChecked={checked("eInvoice")} />
          <Toggle name="allowZeroAmount" label="Allow zero amount" defaultChecked={checked("allowZeroAmount")} />
        </div>
      </FormPanel>

      <FormActions>
        <button
          type="submit"
          disabled={pending || !canManage}
          className="btn-primary rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Saving…" : customer ? "Save changes" : "Create customer"}
        </button>
        <Link href="/customers" className="btn-secondary rounded-lg px-5 py-2 text-sm font-medium">
          Cancel
        </Link>
      </FormActions>
    </Form>
  );
}
