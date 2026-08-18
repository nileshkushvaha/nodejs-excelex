"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { Field, Form, FormError, formField } from "@/components/form-field";
import { FormActions, FormPanel } from "@/components/form-page";
import { Toggle } from "@/components/toggle";
import type { Charge } from "@/lib/api";
import { saveCharge } from "./actions";
import { CALCULATION_BASES, CHARGE_TYPES } from "./labels";

export function ChargeForm({ charge, all }: { charge: Charge | null; all: Charge[] }) {
  const [state, action, pending] = useActionState(saveCharge, null);

  // A charge cannot be built from itself, so it is not on its own checklist.
  const selectable = useMemo(
    () => all.filter((row) => row.id !== charge?.id),
    [all, charge?.id],
  );

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(charge?.components.map((row) => row.id) ?? []),
  );
  const [filter, setFilter] = useState("");

  const visible = filter.trim()
    ? selectable.filter((row) =>
        `${row.code} ${row.name}`.toLowerCase().includes(filter.trim().toLowerCase()),
      )
    : selectable;

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <Form errors={state?.fieldErrors} action={action} className="space-y-5">
      {charge ? <input type="hidden" name="id" value={charge.id} /> : null}
      <FormError result={state} />

      <FormPanel title="Charge">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Code">
            <input
              name="code"
              required
              maxLength={10}
              pattern="[A-Za-z0-9\-]+"
              defaultValue={charge?.code}
              placeholder="FOV"
              className={`${formField} font-mono uppercase`}
            />
          </Field>
          <Field label="Name" span={3}>
            <input
              name="name"
              required
              minLength={2}
              maxLength={120}
              defaultValue={charge?.name}
              placeholder="FREIGHT ON VALUE"
              className={formField}
            />
          </Field>

          <Field label="Charge type" span={2}>
            <select
              name="chargeType"
              defaultValue={charge?.chargeType ?? "AIRWAYBILL"}
              className={formField}
            >
              {CHARGE_TYPES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Calculation base"
            span={2}
            hint="What the rate multiplies. FLAT means the rate is the amount."
          >
            <select
              name="calculationBase"
              defaultValue={charge?.calculationBase ?? "FLAT"}
              className={formField}
            >
              {CALCULATION_BASES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Rate">
            <input
              name="rate"
              inputMode="decimal"
              // Text, not number: the value is an exact decimal all the way to
              // the column, and a number input would round it in the browser.
              pattern="\d{1,8}(\.\d{1,4})?"
              defaultValue={charge?.rate ?? "0"}
              className={`${formField} text-right tabular-nums`}
            />
          </Field>
          <Field label="HSN / SAC code">
            <input
              name="hsnCode"
              maxLength={20}
              defaultValue={charge?.hsnCode ?? ""}
              className={`${formField} font-mono`}
            />
          </Field>
          <Field label="Sequence" hint="Where it prints on an invoice.">
            <input
              name="sequence"
              type="number"
              min={0}
              max={9999}
              defaultValue={charge?.sequence ?? 0}
              className={`${formField} text-right tabular-nums`}
            />
          </Field>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Toggle
            name="applyFuel"
            label="Fuel surcharge"
            description="The fuel surcharge applies on top of this charge."
            defaultChecked={charge?.applyFuel ?? false}
          />
          <Toggle
            name="applyTaxOnFuel"
            label="Tax on fuel"
            description="Tax is charged on the fuel component."
            defaultChecked={charge?.applyTaxOnFuel ?? false}
          />
          <Toggle
            name="applyTax"
            label="Tax"
            description="Tax is charged on this charge."
            defaultChecked={charge?.applyTax ?? false}
          />
          <Toggle name="isActive" label="Active" defaultChecked={charge?.isActive ?? true} />
        </div>
      </FormPanel>

      <FormPanel title="Included charges">
        <p className="mb-3 text-xs text-muted">
          Charges gathered under this one, so booking a single line applies all of them. Leave it
          empty for an ordinary charge.
        </p>

        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by code or name…"
          className={`${formField} mb-2`}
        />

        <div className="max-h-64 overflow-y-auto rounded-lg border border-line-strong">
          {visible.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">
              {selectable.length === 0 ? "No other charges yet." : "Nothing matches that."}
            </p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {visible.map((row) => (
                <li key={row.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-surface-2">
                    <input
                      type="checkbox"
                      // Deliberately unnamed: the filter unmounts rows, and an
                      // unmounted checkbox posts nothing, which would silently
                      // untick anything hidden. The hidden inputs below carry
                      // the selection instead.
                      value={row.id}
                      checked={selected.has(row.id)}
                      onChange={(event) => toggle(row.id, event.target.checked)}
                      className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                    />
                    <span className="font-mono text-xs text-muted">{row.code}</span>
                    <span className="text-fg">{row.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {[...selected].map((id) => (
          <input key={id} type="hidden" name="componentIds" value={id} />
        ))}

        <p className="mt-2 text-xs text-muted">
          {selected.size === 0 ? "None selected." : `${selected.size} selected.`}
        </p>

        <div className="mt-4">
          <Toggle
            name="applyFuelOnComponents"
            label="Fuel surcharge on included charges"
            description="Separate from the charge's own fuel setting above."
            defaultChecked={charge?.applyFuelOnComponents ?? false}
          />
        </div>
      </FormPanel>

      <FormActions>
        <button
          type="submit"
          disabled={pending}
          className="btn-primary rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Saving…" : charge ? "Save changes" : "Create charge"}
        </button>
        <Link href="/rates/charges" className="btn-secondary rounded-lg px-5 py-2 text-sm font-medium">
          Cancel
        </Link>
      </FormActions>
    </Form>
  );
}
