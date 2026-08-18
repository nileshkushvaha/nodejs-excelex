"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Form, FormError } from "@/components/form-field";
import { FormActions, FormPanel } from "@/components/form-page";
import { Toggle } from "@/components/toggle";
import type { Destination, StateRow, Zone } from "@/lib/api";
import { saveDestination } from "./actions";

const field =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft";

const SERVICE_TYPES = ["REGULAR", "METRO", "REMOTE"] as const;

export function DestinationForm({
  destination,
  branches,
  zones,
  states,
  defaultKind,
}: {
  destination: Destination | null;
  branches: Destination[];
  zones: Zone[];
  states: StateRow[];
  defaultKind: string;
}) {
  const [state, action, pending] = useActionState(saveDestination, null);

  // A destination cannot be its own branch, so it is not offered as one.
  const options = branches.filter((branch) => branch.id !== destination?.id);

  return (
    <Form errors={state?.fieldErrors} action={action} className="space-y-4">
          {destination ? <input type="hidden" name="id" value={destination.id} /> : null}
          <FormError result={state} />
  
          <FormPanel title="Destination">
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-fg">Destination code</span>
              <input
                name="code"
                required
                minLength={2}
                maxLength={20}
                pattern="[A-Za-z0-9\-]+"
                defaultValue={destination?.code}
                placeholder="AAM"
                className={`${field} font-mono uppercase`}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-fg">Destination name</span>
              <input
                name="name"
                required
                minLength={2}
                maxLength={120}
                defaultValue={destination?.name}
                placeholder="AMTALA"
                className={field}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-fg">Type</span>
              <select name="kind" defaultValue={destination?.kind ?? defaultKind} className={field}>
                <option value="DOMESTIC">Domestic</option>
                <option value="INTERNATIONAL">International</option>
              </select>
            </label>
          </div>
  
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-fg">Email</span>
              <input
                name="email"
                type="email"
                maxLength={320}
                defaultValue={destination?.email ?? ""}
                className={field}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-fg">Mobile</span>
              <input
                name="mobile"
                maxLength={32}
                defaultValue={destination?.mobile ?? ""}
                className={field}
              />
            </label>
          </div>
  
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-fg">Country</span>
              <input
                name="countryCode"
                maxLength={2}
                defaultValue={destination?.countryCode ?? "IN"}
                className={`${field} uppercase`}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-fg">State</span>
              <select name="stateCode" defaultValue={destination?.stateCode ?? ""} className={field}>
                <option value="">Select state</option>
                {states.map((row) => (
                  <option key={row.code} value={row.code}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-fg">Zone</span>
              <select name="zoneId" defaultValue={destination?.zone?.id ?? ""} className={field}>
                <option value="">Select zone</option>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.code} — {zone.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-fg">Service type</span>
              <select
                name="serviceType"
                defaultValue={destination?.serviceType ?? "REGULAR"}
                className={field}
              >
                {SERVICE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.charAt(0) + type.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>
  
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-fg">Main branch</span>
              <select
                name="mainBranchId"
                defaultValue={destination?.mainBranch?.id ?? ""}
                className={field}
              >
                <option value="">None</option>
                {options.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.code} — {branch.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-fg">Branch manifest</span>
              <select
                name="manifestBranchId"
                defaultValue={destination?.manifestBranch?.id ?? ""}
                className={field}
              >
                <option value="">None</option>
                {options.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.code} — {branch.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
  
          <p className="text-xs text-muted">
            Both branches are themselves destinations — a servicing branch is a destination that
            others report to.
          </p>
  
          <Toggle name="isActive" label="Active" defaultChecked={destination?.isActive ?? true} />
        </FormPanel>
          <FormActions>
            <button
              type="submit"
              disabled={pending}
              className="btn-primary rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-60"
            >
              {pending ? "Saving…" : destination ? "Save changes" : "Create destination"}
            </button>
            <Link href="/network/destinations" className="btn-secondary rounded-lg px-5 py-2 text-sm font-medium">
              Cancel
            </Link>
          </FormActions>
        </Form>
  );
}
