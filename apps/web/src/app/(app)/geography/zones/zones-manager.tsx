"use client";

import Link from "next/link";
import { useActionState } from "react";

import { ActiveBadge, MasterTable } from "@/components/master-table";
import type { Zone } from "@/lib/api";
import { deleteZone } from "./actions";

const field =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft";

export function ZonesManager({ zones, canManage }: { zones: Zone[]; canManage: boolean }) {
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
            <Link href="/geography/zones/new" className="btn-primary rounded-lg px-3 py-2 text-sm font-medium">
                New zone
              </Link>
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
                  <Link
                    href={`/geography/zones/${zone.id}`}
                    className="rounded border border-line-strong px-2 py-1 text-xs text-fg transition-colors hover:border-accent hover:bg-surface-2"
                  >
                    Edit
                  </Link>
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
    </>
  );
}
