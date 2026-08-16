"use client";

import { useActionState, useEffect, useState } from "react";

import { SaveBar, SettingsCard } from "@/components/settings-card";
import type { Country, GeneralSettings, StateRow } from "@/lib/api";
import { saveGeneralSettings } from "./actions";

const field =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:bg-surface-2 disabled:text-muted";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-fg">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function GeneralForm({
  settings,
  countries,
  states,
  timezones,
  currencies,
  canManage,
}: {
  settings: GeneralSettings;
  countries: Country[];
  states: StateRow[];
  timezones: string[];
  currencies: Array<{ code: string; label: string }>;
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(saveGeneralSettings, null);
  const [stateCode, setStateCode] = useState(settings.stateCode ?? "");
  const [gstin, setGstin] = useState(settings.gstin ?? "");

  const selectedState = states.find((row) => row.code === stateCode);

  // The first two digits of a GSTIN are the GST code of the issuing state, so a
  // mismatch is checkable before the round trip. The API checks it again — this
  // is a courtesy, not the control.
  const gstStateMismatch =
    gstin.length >= 2 && selectedState?.gstCode ? !gstin.startsWith(selectedState.gstCode) : false;

  useEffect(() => {
    if (state?.ok) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [state]);

  return (
    <form action={action} className="space-y-5">
      {state?.ok ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
        >
          Settings saved.
        </p>
      ) : null}
      {state && !state.ok ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
        >
          {state.error}
        </p>
      ) : null}

      <SettingsCard
        title="Company identity"
        description="How this business is named on documents and in the interface."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Legal name" hint="As registered. Appears on invoices and tax documents.">
            <input
              name="legalName"
              required
              minLength={2}
              maxLength={160}
              defaultValue={settings.legalName}
              disabled={!canManage}
              className={field}
            />
          </Field>
          <Field label="Trading name" hint="Optional. Used where the full legal name is unwieldy.">
            <input
              name="tradingName"
              maxLength={160}
              defaultValue={settings.tradingName ?? ""}
              disabled={!canManage}
              className={field}
            />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Statutory registrations"
        description="Indian tax and company registrations. Each is checked for shape before it is stored."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="GSTIN" hint="15 characters. Must match the registered state.">
            <input
              name="gstin"
              maxLength={15}
              value={gstin}
              onChange={(event) => setGstin(event.target.value.toUpperCase())}
              placeholder="27AABCU9603R1ZM"
              disabled={!canManage}
              className={`${field} font-mono uppercase`}
            />
          </Field>
          <Field label="PAN" hint="10 characters.">
            <input
              name="pan"
              maxLength={10}
              defaultValue={settings.pan ?? ""}
              placeholder="AABCU9603R"
              disabled={!canManage}
              className={`${field} font-mono uppercase`}
            />
          </Field>
          <Field label="CIN" hint="21 characters, if incorporated.">
            <input
              name="cin"
              maxLength={21}
              defaultValue={settings.cin ?? ""}
              placeholder="U63030MH2015PTC123456"
              disabled={!canManage}
              className={`${field} font-mono uppercase`}
            />
          </Field>
        </div>

        {gstStateMismatch ? (
          <p className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
            This GSTIN begins with <strong>{gstin.slice(0, 2)}</strong>, but{" "}
            {selectedState?.name} is GST state <strong>{selectedState?.gstCode}</strong>. One of the
            two is wrong — a mismatch is only caught later, when a tax authority rejects an invoice.
          </p>
        ) : null}
      </SettingsCard>

      <SettingsCard title="Contact" description="Where customers and staff reach this business.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Support email">
            <input
              name="supportEmail"
              type="email"
              maxLength={320}
              defaultValue={settings.supportEmail ?? ""}
              disabled={!canManage}
              className={field}
            />
          </Field>
          <Field label="Support phone">
            <input
              name="supportPhone"
              maxLength={32}
              defaultValue={settings.supportPhone ?? ""}
              disabled={!canManage}
              className={field}
            />
          </Field>
          <Field label="Website" hint="Include http:// or https://.">
            <input
              name="websiteUrl"
              type="url"
              maxLength={200}
              defaultValue={settings.websiteUrl ?? ""}
              disabled={!canManage}
              className={field}
            />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Registered address"
        description="The address on invoices and statutory documents."
      >
        <Field label="Address line 1">
          <input
            name="addressLine1"
            maxLength={200}
            defaultValue={settings.addressLine1 ?? ""}
            disabled={!canManage}
            className={field}
          />
        </Field>
        <Field label="Address line 2">
          <input
            name="addressLine2"
            maxLength={200}
            defaultValue={settings.addressLine2 ?? ""}
            disabled={!canManage}
            className={field}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="City">
            <input
              name="city"
              maxLength={80}
              defaultValue={settings.city ?? ""}
              disabled={!canManage}
              className={field}
            />
          </Field>
          <Field label="State" hint={selectedState?.gstCode ? `GST ${selectedState.gstCode}` : undefined}>
            <select
              name="stateCode"
              value={stateCode}
              onChange={(event) => setStateCode(event.target.value)}
              disabled={!canManage}
              className={field}
            >
              <option value="">Not set</option>
              {states.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Country">
            <select
              name="countryCode"
              defaultValue={settings.countryCode}
              disabled={!canManage}
              className={field}
            >
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Postal code">
            <input
              name="postalCode"
              maxLength={16}
              defaultValue={settings.postalCode ?? ""}
              disabled={!canManage}
              className={field}
            />
          </Field>
        </div>

        <p className="text-xs text-muted">
          The state list is filtered to the selected country. Changing country does not clear the
          state here — save and reopen if you change it, so a half-edited address is never stored.
        </p>
      </SettingsCard>

      <SettingsCard
        title="Localisation"
        description="Presentation only. Everything is stored in UTC and in exact decimal amounts."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Time zone" hint="Times are displayed in this zone across the product.">
            <select
              name="timezone"
              defaultValue={settings.timezone}
              disabled={!canManage}
              className={field}
            >
              {timezones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Currency">
            <select
              name="currency"
              defaultValue={settings.currency}
              disabled={!canManage}
              className={field}
            >
              {currencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date format">
            <select
              name="dateFormat"
              defaultValue={settings.dateFormat}
              disabled={!canManage}
              className={field}
            >
              <option value="dd/MM/yyyy">31/12/2026</option>
              <option value="dd-MM-yyyy">31-12-2026</option>
              <option value="yyyy-MM-dd">2026-12-31</option>
              <option value="MM/dd/yyyy">12/31/2026</option>
            </select>
          </Field>
          <Field label="Week starts on" hint="Affects weekly reports and date pickers.">
            <select
              name="weekStart"
              defaultValue={String(settings.weekStart)}
              disabled={!canManage}
              className={field}
            >
              <option value="1">Monday</option>
              <option value="7">Sunday</option>
            </select>
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Documents"
        description="Defaults applied to invoices and printed paperwork."
      >
        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <Field label="Invoice prefix" hint="e.g. EXL/2026/0001">
            <input
              name="invoicePrefix"
              maxLength={12}
              defaultValue={settings.invoicePrefix ?? ""}
              disabled={!canManage}
              className={`${field} font-mono uppercase`}
            />
          </Field>
          <Field label="Invoice footer" hint="One line, printed at the foot of every invoice.">
            <input
              name="invoiceFooter"
              maxLength={500}
              defaultValue={settings.invoiceFooter ?? ""}
              disabled={!canManage}
              className={field}
            />
          </Field>
        </div>

        <Field label="Terms and conditions" hint="Printed on documents where terms are required.">
          <textarea
            name="termsText"
            rows={4}
            maxLength={2000}
            defaultValue={settings.termsText ?? ""}
            disabled={!canManage}
            className={field}
          />
        </Field>
      </SettingsCard>

      <SettingsCard title="Branding" description="Logo and favicon shown across the product.">
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
          <strong>Not available yet.</strong> Uploads need the object-storage service, which is in
          the stack but not wired to the API. The columns exist and the screen will grow a file
          picker when they work — a picker that silently discarded your logo would be worse than
          this message.
        </p>
      </SettingsCard>

      <SaveBar pending={pending} updatedAt={settings.updatedAt} canManage={canManage} />
    </form>
  );
}
