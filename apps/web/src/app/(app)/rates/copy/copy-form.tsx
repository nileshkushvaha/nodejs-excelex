"use client";

import { useActionState, useState } from "react";

import { Field, FormError, formField } from "@/components/form-field";
import { FormActions, FormPanel } from "@/components/form-page";
import type { Destination } from "@/lib/api";
import { copyRates, type CopyResult } from "./actions";

type Option = { id: string; code: string; name: string };

/**
 * Copy rates from one selection to another.
 *
 * Preview first, always. This writes hundreds of rates in one press, and the
 * report is what turns that from a leap into a decision: how many match, how
 * many already exist at the target, and what three of them cost before and
 * after.
 */
export function CopyRatesForm({
  customers,
  products,
  destinations,
  canManage,
}: {
  customers: Option[];
  products: Option[];
  destinations: Destination[];
  canManage: boolean;
}) {
  const [mode, setMode] = useState<"preview" | "commit">("preview");
  const [state, submit, pending] = useActionState<CopyResult | null, FormData>(copyRates, null);

  const report = state?.report;
  const previewed = report?.mode === "preview" && report.matched > 0;

  return (
    <form action={submit} className="space-y-5">
      <input type="hidden" name="mode" value={mode} />
      <FormError message={state?.ok === false ? state.error : undefined} />

      <div className="grid gap-5 lg:grid-cols-2">
        <FormPanel title="Copy from" description="Which rates to read. Blank means any.">
          <Lane prefix="from" customers={customers} products={products} destinations={destinations} withDate />
        </FormPanel>

        <FormPanel title="Copy to" description="What to change. Anything left blank is carried across.">
          <Lane prefix="to" customers={customers} products={products} destinations={destinations} />
          <div className="mt-3">
            <Field label="Effective from" hint="Every copied rate takes effect from this date.">
              <input type="date" name="toEffectiveFrom" required className={formField} />
            </Field>
          </div>
        </FormPanel>
      </div>

      <FormPanel title="Increase">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Percentage increase" hint="0 copies the rates unchanged.">
            <input
              name="percentageIncrease"
              inputMode="decimal"
              defaultValue="0"
              className={`${formField} tabular-nums`}
            />
          </Field>
          <Field label="Rounding" hint="A tariff prices to four places; an invoice rarely should.">
            <select name="rounding" defaultValue="NONE" className={formField}>
              <option value="NONE">None</option>
              <option value="NEAREST">To the nearest rupee</option>
              <option value="UP">Up</option>
              <option value="DOWN">Down</option>
            </select>
          </Field>
        </div>
      </FormPanel>

      {report ? (
        <div
          className={`rounded-xl border p-4 text-sm ${
            report.mode === "commit"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
              : "border-line bg-surface-2 text-fg"
          }`}
        >
          <p className="font-medium">
            {report.mode === "commit"
              ? `Copied. ${report.created} created, ${report.replaced} replaced, ${report.lines} lines.`
              : `${report.matched} rate card(s) match, ${report.lines} lines in total.`}
          </p>

          {report.mode === "preview" && report.replaced > 0 ? (
            <p className="mt-2 text-amber-700 dark:text-amber-300">
              {report.replaced} of them already exist at that date and would be replaced.
            </p>
          ) : null}

          {report.examples.length > 0 ? (
            <table className="mt-3 w-full text-xs">
              <thead className="text-left text-muted">
                <tr>
                  <th className="pb-1 font-medium">Lane</th>
                  <th className="pb-1 font-medium">First line now</th>
                  <th className="pb-1 font-medium">After</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {report.examples.map((example) => (
                  <tr key={example.lane}>
                    <td className="py-0.5 pr-4">{example.lane}</td>
                    <td className="py-0.5 pr-4 text-muted">{example.before}</td>
                    <td className="py-0.5 font-medium">{example.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {report.mode === "preview" && report.matched === 0 ? (
            <p className="mt-2 text-muted">Nothing matches that selection, so there is nothing to copy.</p>
          ) : null}
        </div>
      ) : null}

      <FormActions>
        <button
          type="submit"
          onClick={() => setMode("preview")}
          disabled={pending || !canManage}
          className="btn-secondary rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending && mode === "preview" ? "Checking…" : "Preview"}
        </button>

        {/* Only offered once a preview has shown what would happen. */}
        <button
          type="submit"
          onClick={() => setMode("commit")}
          disabled={pending || !canManage || !previewed}
          className="btn-primary rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-60"
          title={previewed ? undefined : "Preview first, so you can see what would change."}
        >
          {pending && mode === "commit" ? "Copying…" : "Copy rates"}
        </button>
      </FormActions>
    </form>
  );
}

function Lane({
  prefix,
  customers,
  products,
  destinations,
  withDate = false,
}: {
  prefix: "from" | "to";
  customers: Option[];
  products: Option[];
  destinations: Destination[];
  withDate?: boolean;
}) {
  const name = (field: string) => `${prefix}${field}`;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Customer">
        <select name={name("CustomerId")} className={formField}>
          <option value="">Any</option>
          {customers.map((row) => (
            <option key={row.id} value={row.id}>
              {row.code} — {row.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Product">
        <select name={name("ProductId")} className={formField}>
          <option value="">Any</option>
          {products.map((row) => (
            <option key={row.id} value={row.id}>
              {row.code} — {row.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Origin">
        <select name={name("OriginId")} className={formField}>
          <option value="">Any</option>
          {destinations.map((row) => (
            <option key={row.id} value={row.id}>
              {row.code} — {row.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Destination">
        <select name={name("DestinationId")} className={formField}>
          <option value="">Any</option>
          {destinations.map((row) => (
            <option key={row.id} value={row.id}>
              {row.code} — {row.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Vendor">
        <input name={name("Vendor")} maxLength={120} className={formField} />
      </Field>
      <Field label="Service">
        <input name={name("Service")} maxLength={60} className={formField} />
      </Field>
      {withDate ? (
        <Field label="Effective from" hint="Blank reads every date.">
          <input type="date" name="fromEffectiveFrom" className={formField} />
        </Field>
      ) : null}
    </div>
  );
}
