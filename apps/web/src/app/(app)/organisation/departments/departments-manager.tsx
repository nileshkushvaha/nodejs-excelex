"use client";

import Link from "next/link";
import { useActionState } from "react";

import { ActiveBadge, MasterTable } from "@/components/master-table";
import type { Department } from "@/lib/api";
import { deleteDepartment } from "../actions";

const field =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft";

export function DepartmentsManager({
  departments,
  canManage,
}: {
  departments: Department[];
  canManage: boolean;
}) {
  const [removeState, removeAction] = useActionState(deleteDepartment, null);

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
        rows={departments}
        rowKey={(department) => department.id}
        searchable={(department) => `${department.code} ${department.name} ${department.description ?? ""}`}
        placeholder="Search departments…"
        empty="No departments yet."
        actions={
          canManage ? (
            <Link href="/organisation/departments/new" className="btn-primary rounded-lg px-3 py-2 text-sm font-medium">
                New department
              </Link>
          ) : null
        }
        columns={[
          {
            header: "Code",
            cell: (department) => (
              <span className="font-mono text-xs text-muted">{department.code}</span>
            ),
          },
          {
            header: "Name",
            cell: (department) => (
              <>
                <span className="font-medium text-fg">{department.name}</span>
                {department.description ? (
                  <span className="block text-xs text-muted">{department.description}</span>
                ) : null}
              </>
            ),
          },
          {
            header: "Designations",
            cell: (department) => (
              <span className="text-xs tabular-nums text-muted">{department.designationCount}</span>
            ),
          },
          { header: "Status", cell: (department) => <ActiveBadge active={department.isActive} /> },
          {
            header: "",
            className: "text-right",
            cell: (department) =>
              canManage ? (
                <span className="flex justify-end gap-2">
                  <Link
                    href={`/organisation/departments/${department.id}`}
                    className="rounded border border-line-strong px-2 py-1 text-xs text-fg hover:bg-surface-2"
                  >
                    Edit
                  </Link>
                  <form action={removeAction}>
                    <input type="hidden" name="id" value={department.id} />
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
