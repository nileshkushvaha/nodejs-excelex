"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Field, FormError, formField } from "@/components/form-field";
import { FormActions, FormPanel } from "@/components/form-page";
import { Toggle } from "@/components/toggle";
import type { Classification, Product } from "@/lib/api";
import { saveProduct } from "./actions";

export function ProductForm({
  product,
  types,
  groups,
}: {
  product: Product | null;
  types: Classification[];
  groups: Classification[];
}) {
  const [state, action, pending] = useActionState(saveProduct, null);
  const [contentKind, setContentKind] = useState<"DOX" | "NDOX">(product?.contentKind ?? "NDOX");

  return (
    <form action={action} className="space-y-5">
      {product ? <input type="hidden" name="id" value={product.id} /> : null}
      <input type="hidden" name="contentKind" value={contentKind} />
      <FormError message={state?.error} />

      <FormPanel title="Product">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Product code">
            <input
              name="code"
              required
              minLength={2}
              maxLength={20}
              pattern="[A-Za-z0-9\\-]+"
              defaultValue={product?.code}
              placeholder="SFC"
              className={`${formField} font-mono uppercase`}
            />
          </Field>
          <Field label="Product name" span={2}>
            <input
              name="name"
              required
              minLength={2}
              maxLength={120}
              defaultValue={product?.name}
              placeholder="Surface"
              className={formField}
            />
          </Field>
          <Field label="Product service">
            <input
              name="service"
              maxLength={40}
              defaultValue={product?.service ?? ""}
              placeholder="SELF"
              className={`${formField} uppercase`}
            />
          </Field>

          <Field label="Product type" span={2}>
            <select name="productTypeId" defaultValue={product?.productType?.id ?? ""} className={formField}>
              <option value="">Not set</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Group type" span={2}>
            <select name="productGroupId" defaultValue={product?.productGroup?.id ?? ""} className={formField}>
              <option value="">Not set</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <fieldset className="mt-4">
          <legend className="mb-1 text-xs font-medium text-muted">Content</legend>
          <div
            role="radiogroup"
            aria-label="Content kind"
            className="inline-flex overflow-hidden rounded-lg border border-line-strong"
          >
            {(["DOX", "NDOX"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={contentKind === kind}
                onClick={() => setContentKind(kind)}
                className={`px-5 py-1.5 text-sm font-medium transition-colors ${
                  contentKind === kind ? "brand-gradient text-white" : "bg-surface text-muted hover:bg-surface-2"
                }`}
              >
                {kind}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Documents or non-documents. It belongs to the product rather than the type — DOX and SPX
            are both International and differ only here — and it drives rating, packaging and
            customs paperwork.
          </p>
        </fieldset>
      </FormPanel>

      <FormPanel title="Charges and status">
        <div className="space-y-3">
          <Toggle
            name="fuelCharge"
            label="Fuel surcharge applies"
            description="Turn off for all-inclusive quotes such as port-to-port, which must not attract it on top."
            defaultChecked={product?.fuelCharge ?? true}
          />
          <Toggle
            name="gstReverse"
            label="GST reverse charge"
            description="The recipient accounts for GST instead of the supplier."
            defaultChecked={product?.gstReverse ?? false}
          />
          <Toggle
            name="isActive"
            label="Active"
            description="Inactive products stay on historic shipments but are not offered when booking."
            defaultChecked={product?.isActive ?? true}
          />
        </div>
      </FormPanel>

      <FormActions>
        <button
          type="submit"
          disabled={pending}
          className="btn-primary rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Saving…" : product ? "Save changes" : "Create product"}
        </button>
        <Link href="/products" className="btn-secondary rounded-lg px-5 py-2 text-sm font-medium">
          Cancel
        </Link>
      </FormActions>
    </form>
  );
}
