"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useMemo, useState, useTransition } from "react";

import { DataToolbar } from "@/components/data-toolbar";
import { FilterBar, type FilterDefinition } from "@/components/filter-bar";
import { Field, Form, FormError, formField } from "@/components/form-field";
import { FormPanel } from "@/components/form-page";
import { ActiveBadge, MasterTable } from "@/components/master-table";
import { Pager } from "@/components/pager";
import { Toggle } from "@/components/toggle";
import type { ActionResult, Destination, PinCode, PinCodePage, StateRow, Zone } from "@/lib/api";
import { deletePinCode, savePinCode } from "./actions";

/**
 * Pin codes.
 *
 * Server-paged: India has roughly nineteen thousand, and a client that
 * imports the lot would otherwise send all of them to a browser showing
 * twenty. Editing is inline because a pin code is six fields — a separate
 * route would be a page load to set a zone.
 */
export function PinCodesManager({
  page,
  destinations,
  zones,
  states,
  canManage,
}: {
  page: PinCodePage;
  destinations: Destination[];
  zones: Zone[];
  states: StateRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<PinCode | "new" | null>(null);
  const [removeState, removeAction] = useActionState(deletePinCode, null);

  const definitions = useMemo<ReadonlyArray<FilterDefinition<PinCode>>>(
    () => [
      { kind: "text", key: "search", label: "Search", placeholder: "Pin code, city or area…", span: 3 },
      {
        kind: "select",
        key: "destinationId",
        label: "Destination",
        options: destinations.map((row) => ({ value: row.id, label: `${row.code} — ${row.name}` })),
      },
      {
        kind: "select",
        key: "zoneId",
        label: "Zone",
        options: zones.map((row) => ({ value: row.id, label: `${row.code} — ${row.name}` })),
      },
      {
        kind: "select",
        key: "status",
        label: "Status",
        options: [
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ],
      },
    ],
    [destinations, zones],
  );

  const values = Object.fromEntries(
    definitions.map((definition) => [definition.key, params.get(definition.key) ?? ""]),
  );

  function apply(next: Record<string, string>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    query.delete("page");
    startTransition(() => router.replace(`${pathname}?${query.toString()}`));
  }

  return (
    <>
      <FormError message={removeState?.ok === false ? removeState.error : undefined} />

      <FilterBar
        definitions={definitions}
        values={values}
        onChange={apply}
        active={Object.values(values).some((value) => value !== "")}
        onReset={() => startTransition(() => router.replace(pathname))}
        total={page.total}
        shown={page.rows.length}
        noun={{ one: "pin code", many: "pin codes" }}
        actions={
          <>
            <DataToolbar
              master="pin-codes"
              label="Pin codes"
              canImport={canManage}
              query={params.toString()}
            />
            {canManage ? (
              <button
                type="button"
                onClick={() => setEditing((current) => (current ? null : "new"))}
                className="btn-primary rounded-lg px-3 py-2 text-sm font-medium"
              >
                {editing ? "Cancel" : "New pin code"}
              </button>
            ) : null}
          </>
        }
      />

      {editing ? (
        <div className="mb-4" key={editing === "new" ? "new" : editing.id}>
          <RowForm
            row={editing === "new" ? null : editing}
            destinations={destinations}
            zones={zones}
            states={states}
            onDone={() => setEditing(null)}
          />
        </div>
      ) : null}

      <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <MasterTable
          rows={page.rows}
          rowKey={(row) => row.id}
          empty="No pin codes match these filters."
          columns={[
            {
              header: "Pin code",
              cell: (row) => (
                <span className="font-mono text-xs font-medium tabular-nums text-fg">{row.code}</span>
              ),
            },
            { header: "City", cell: (row) => <span className="text-fg">{row.city ?? "—"}</span> },
            { header: "Area", cell: (row) => <span className="text-xs text-muted">{row.area ?? "—"}</span> },
            {
              header: "State",
              cell: (row) => <span className="text-xs text-muted">{row.stateCode ?? "—"}</span>,
            },
            {
              header: "Destination",
              cell: (row) => (
                <span className="font-mono text-xs text-muted">{row.destination?.code ?? "—"}</span>
              ),
            },
            {
              header: "Zone",
              cell: (row) => <span className="text-xs text-muted">{row.zone?.code ?? "—"}</span>,
            },
            {
              header: "ODA",
              cell: (row) =>
                row.oda ? (
                  // Out of delivery area changes what a shipment costs and who
                  // delivers it, so it is worth seeing at a glance.
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
                    ODA
                  </span>
                ) : (
                  <span className="text-xs text-faint">—</span>
                ),
            },
            { header: "Status", cell: (row) => <ActiveBadge active={row.isActive} /> },
            {
              header: "Action",
              className: "text-right",
              cell: (row) =>
                canManage ? (
                  <span className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(row)}
                      className="rounded border border-line-strong px-2 py-1 text-xs text-fg transition-colors hover:border-accent hover:bg-surface-2"
                    >
                      Edit
                    </button>
                    <form action={removeAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <button
                        type="submit"
                        aria-label={`Delete ${row.code}`}
                        className="rounded border border-line-strong px-2 py-1 text-xs text-red-700 transition-colors hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/50"
                      >
                        Delete
                      </button>
                    </form>
                  </span>
                ) : null,
            },
          ]}
        />
      </div>

      <Pager page={page.page} pageCount={page.pageCount} total={page.total} pageSize={page.pageSize} />
    </>
  );
}

function RowForm({
  row,
  destinations,
  zones,
  states,
  onDone,
}: {
  row: PinCode | null;
  destinations: Destination[];
  zones: Zone[];
  states: StateRow[];
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(
    async (previous: ActionResult | null, form: FormData) => {
      const result = await savePinCode(previous, form);
      if (result.ok) onDone();
      return result;
    },
    null,
  );

  return (
    <Form action={submit} errors={state?.fieldErrors}>
      {row ? <input type="hidden" name="id" value={row.id} /> : null}
      <FormError result={state} />

      <FormPanel title={row ? `Edit ${row.code}` : "New pin code"}>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Pin code">
            <input
              name="code"
              required
              maxLength={12}
              defaultValue={row?.code ?? ""}
              className={`${formField} font-mono tabular-nums`}
            />
          </Field>
          <Field label="City">
            <input name="city" maxLength={80} defaultValue={row?.city ?? ""} className={formField} />
          </Field>
          <Field label="Area">
            <input name="area" maxLength={120} defaultValue={row?.area ?? ""} className={formField} />
          </Field>
          <Field label="State">
            <select name="stateCode" defaultValue={row?.stateCode ?? ""} className={formField}>
              <option value="">—</option>
              {states.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Destination" hint="Which servicing point covers it.">
            <select name="destinationId" defaultValue={row?.destination?.id ?? ""} className={formField}>
              <option value="">—</option>
              {destinations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} — {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Zone">
            <select name="zoneId" defaultValue={row?.zone?.id ?? ""} className={formField}>
              <option value="">—</option>
              {zones.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} — {item.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex items-end gap-4">
            <Toggle name="oda" label="ODA" defaultChecked={row?.oda ?? false} />
            <Toggle name="isActive" label="Active" defaultChecked={row?.isActive ?? true} />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={pending}
              className="btn-primary w-full rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </FormPanel>
    </Form>
  );
}
