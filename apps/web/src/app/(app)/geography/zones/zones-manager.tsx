"use client";

import { useActionState, useEffect, useState } from "react";

import { MasterDialog } from "@/components/master-dialog";
import { ActiveBadge, MasterTable } from "@/components/master-table";
import { Toggle } from "@/components/toggle";
import type { Zone } from "@/lib/api";
import { deleteZone, saveZone } from "./actions";

const field =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft";

export function ZonesManager({ zones, canManage }: { zones: Zone[]; canManage: boolean }) {
  const [editing, setEditing] = useState<Zone | null>(null);
  const [creating, setCreating] = useState(false);
  const [removeState, removeAction] = useActionState(deleteZone, null);

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

      <MasterTable
        rows={zones}
        rowKey={(zone) => zone.id}
        searchable={(zone) => `${zone.code} ${zone.name}`}
        placeholder="Search zones…"
        empty="No zones yet. Add the ones your rate cards price against."
        actions={
          canManage ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="btn-primary rounded-lg px-3 py-2 text-sm font-medium"
            >
              New zone
            </button>
          ) : null
        }
        columns={[
          {
            header: "Zone code",
            cell: (zone) => (
              <span className="font-mono text-xs font-medium text-fg">{zone.code}</span>
            ),
          },
          { header: "Zone name", cell: (zone) => <span className="text-fg">{zone.name}</span> },
          { header: "Status", cell: (zone) => <ActiveBadge active={zone.isActive} /> },
          {
            header: "",
            className: "text-right",
            cell: (zone) =>
              canManage ? (
                <span className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(zone)}
                    className="rounded border border-line-strong px-2 py-1 text-xs text-fg transition-colors hover:border-accent hover:bg-surface-2"
                  >
                    Edit
                  </button>
                  <form action={removeAction}>
                    <input type="hidden" name="id" value={zone.id} />
                    <button
                      type="submit"
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

      <ZoneDialog
        key={editing?.id ?? "new"}
        open={creating || editing !== null}
        zone={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </>
  );
}

function ZoneDialog({
  open,
  zone,
  onClose,
}: {
  open: boolean;
  zone: Zone | null;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(saveZone, null);

  // Closing on success rather than on submit: a rejected save has to leave the
  // dialog open with its message, or the reason disappears with it.
  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <MasterDialog
      open={open}
      onClose={onClose}
      title={zone ? `Edit ${zone.code}` : "New zone"}
      description="Destinations are grouped into zones, and rate cards price zone pairs."
    >
      <form action={action} className="space-y-4">
        {zone ? <input type="hidden" name="id" value={zone.id} /> : null}

        {state && !state.ok ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
          >
            {state.error}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-fg">Zone code</span>
            <input
              name="code"
              required
              maxLength={20}
              pattern="[A-Za-z0-9\-]+"
              defaultValue={zone?.code}
              placeholder="Z1"
              className={`${field} font-mono uppercase`}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-fg">Zone name</span>
            <input
              name="name"
              required
              minLength={2}
              maxLength={80}
              defaultValue={zone?.name}
              placeholder="Within city"
              className={field}
            />
          </label>
        </div>

        <Toggle name="isActive" label="Active" defaultChecked={zone?.isActive ?? true} />

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {pending ? "Saving…" : zone ? "Save changes" : "Create zone"}
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
