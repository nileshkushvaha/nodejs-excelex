"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { ImportDialog } from "@/components/import-dialog";
import { MasterDialog } from "@/components/master-dialog";
import { ActiveBadge } from "@/components/master-table";
import { PagedTable } from "@/components/paged-table";
import { Toggle } from "@/components/toggle";
import type { Destination, DestinationPage, StateRow, Zone } from "@/lib/api";
import { deleteDestination, saveDestination } from "./actions";

const field =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft";

const SERVICE_TYPES = ["REGULAR", "METRO", "REMOTE"] as const;

export function DestinationsManager({
  data,
  branches,
  zones,
  states,
  canManage,
}: {
  data: DestinationPage;
  branches: Destination[];
  zones: Zone[];
  states: StateRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const [editing, setEditing] = useState<Destination | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [removeState, removeAction] = useActionState(deleteDestination, null);

  const kind = params.get("kind") ?? "DOMESTIC";

  function setKind(next: string) {
    const search = new URLSearchParams(params.toString());
    search.set("kind", next);
    search.delete("page");
    router.push(`/network/destinations?${search.toString()}`);
  }

  return (
    <>
      {removeState && !removeState.ok ? (
        <p
          role="alert"
          className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
        >
          {removeState.error}
        </p>
      ) : null}

      <PagedTable
        rows={data.rows}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        pageCount={data.pageCount}
        basePath="/network/destinations"
        rowKey={(row) => row.id}
        empty="No destinations match. Clear the filters, or import your master."
        toolbar={
          <>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted">Type</span>
              <select value={kind} onChange={(event) => setKind(event.target.value)} className={`${field} w-44`}>
                <option value="DOMESTIC">Domestic</option>
                <option value="INTERNATIONAL">International</option>
              </select>
            </label>

            <span className="flex-1" />

            <a
              href={`/api/v1/masters/destinations/export?kind=${kind}`}
              className="btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
            >
              Export
            </a>

            {canManage ? (
              <>
                <button
                  type="button"
                  onClick={() => setImporting(true)}
                  className="btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
                >
                  Import
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="btn-primary rounded-lg px-3 py-2 text-sm font-medium"
                >
                  New destination
                </button>
              </>
            ) : null}
          </>
        }
        columns={[
          {
            header: "Destination Code",
            sortKey: "code",
            filterKey: "code",
            cell: (row) => <span className="font-mono text-xs font-medium text-fg">{row.code}</span>,
          },
          {
            header: "Destination Name",
            sortKey: "name",
            filterKey: "name",
            cell: (row) => <span className="text-fg">{row.name}</span>,
          },
          {
            header: "Country",
            filterKey: "countryCode",
            cell: (row) => <span className="text-xs text-muted">{row.countryCode}</span>,
          },
          {
            header: "State",
            sortKey: "stateCode",
            filterKey: "stateCode",
            cell: (row) => <span className="text-xs text-muted">{row.stateCode ?? "—"}</span>,
          },
          {
            header: "Zone",
            cell: (row) => <span className="text-xs text-muted">{row.zone?.code ?? "—"}</span>,
          },
          {
            header: "Main Branch",
            cell: (row) => (
              <span className="font-mono text-xs text-muted">{row.mainBranch?.code ?? "—"}</span>
            ),
          },
          {
            header: "Service Type",
            sortKey: "serviceType",
            filterKey: "serviceType",
            cell: (row) => <ServiceBadge type={row.serviceType} />,
          },
          {
            header: "Status",
            sortKey: "isActive",
            filterKey: "status",
            cell: (row) => <ActiveBadge active={row.isActive} />,
          },
          {
            header: "Action",
            className: "text-right",
            cell: (row) =>
              canManage ? (
                <span className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(row)}
                    aria-label={`Edit ${row.code}`}
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

      <ImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        title="Import destinations"
        endpoint="/api/v1/masters/destinations/import"
        templateHref="/api/v1/masters/destinations/import/template"
      />

      <DestinationDialog
        key={editing?.id ?? "new"}
        open={creating || editing !== null}
        destination={editing}
        branches={branches}
        zones={zones}
        states={states}
        defaultKind={kind}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </>
  );
}

function ServiceBadge({ type }: { type: "REGULAR" | "METRO" | "REMOTE" }) {
  // Remote is the one that changes what a shipment costs and how long it takes,
  // so it is the one that is allowed to draw the eye.
  const tone = {
    REGULAR: "bg-surface-3 text-muted",
    METRO: "bg-accent-soft text-accent-text",
    REMOTE: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
  }[type];

  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${tone}`}>
      {type}
    </span>
  );
}

function DestinationDialog({
  open,
  destination,
  branches,
  zones,
  states,
  defaultKind,
  onClose,
}: {
  open: boolean;
  destination: Destination | null;
  branches: Destination[];
  zones: Zone[];
  states: StateRow[];
  defaultKind: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(saveDestination, null);

  // Closing on success rather than on submit: a rejected save has to leave the
  // dialog open with its message, or the reason disappears with it.
  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  // A destination cannot be its own branch, so it is not offered as one.
  const options = branches.filter((branch) => branch.id !== destination?.id);

  return (
    <MasterDialog
      open={open}
      onClose={onClose}
      title={destination ? `Edit ${destination.code}` : "New destination"}
      description="A servicing point shipments are booked to."
      wide
    >
      <form action={action} className="space-y-4">
        {destination ? <input type="hidden" name="id" value={destination.id} /> : null}

        {state && !state.ok ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
          >
            {state.error}
          </p>
        ) : null}

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

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {pending ? "Saving…" : destination ? "Save changes" : "Create destination"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary rounded-lg px-4 py-2 text-sm font-medium"
          >
            Close
          </button>
        </div>
      </form>
    </MasterDialog>
  );
}
