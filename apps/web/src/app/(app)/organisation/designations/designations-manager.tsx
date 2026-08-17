"use client";

import Link from "next/link";
import { useActionState } from "react";

import { ActiveBadge, MasterTable } from "@/components/master-table";
import type { Department, Designation } from "@/lib/api";
import { deleteDesignation } from "../actions";

const field =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft";

export function DesignationsManager({
  designations,
  departments,
  canManage,
}: {
  designations: Designation[];
  departments: Department[];
  canManage: boolean;
}) {
  const [removeState, removeAction] = useActionState(deleteDesignation, null);

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
        rows={designations}
        rowKey={(designation) => designation.id}
        searchable={(designation) =>
          `${designation.code} ${designation.name} ${designation.department?.name ?? ""} ${designation.description ?? ""}`
        }
        placeholder="Search designations…"
        empty="No designations yet."
        actions={
          canManage ? (
            <Link href="/organisation/designations/new" className="btn-primary rounded-lg px-3 py-2 text-sm font-medium">
                New designation
              </Link>
          ) : null
        }
        columns={[
          {
            header: "Code",
            cell: (designation) => (
              <span className="font-mono text-xs text-muted">{designation.code}</span>
            ),
          },
          {
            header: "Title",
            cell: (designation) => (
              <>
                <span className="font-medium text-fg">{designation.name}</span>
                {designation.description ? (
                  <span className="block text-xs text-muted">{designation.description}</span>
                ) : null}
              </>
            ),
          },
          {
            header: "Department",
            cell: (designation) =>
              designation.department ? (
                <span className="text-xs text-muted">{designation.department.name}</span>
              ) : (
                // A title above any one department, not a missing value.
                <span className="text-xs italic text-faint">Company-wide</span>
              ),
          },
          {
            header: "Level",
            cell: (designation) => (
              <span className="text-xs tabular-nums text-muted">{designation.level}</span>
            ),
          },
          { header: "Status", cell: (designation) => <ActiveBadge active={designation.isActive} /> },
          {
            header: "",
            className: "text-right",
            cell: (designation) =>
              canManage ? (
                <span className="flex justify-end gap-2">
                  <Link
                    href={`/organisation/designations/${designation.id}`}
                    className="rounded border border-line-strong px-2 py-1 text-xs text-fg hover:bg-surface-2"
                  >
                    Edit
                  </Link>
                  <form action={removeAction}>
                    <input type="hidden" name="id" value={designation.id} />
                    <button
                      type="submit"
                      className="rounded border border-line-strong px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/50"
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
