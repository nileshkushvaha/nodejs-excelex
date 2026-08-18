"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FilterBar, useFilterBar, type FilterDefinition } from "@/components/filter-bar";
import { DataToolbar } from "@/components/data-toolbar";
import { ActiveBadge, MasterTable } from "@/components/master-table";
import type { Department } from "@/lib/api";
import { deleteDepartment } from "../actions";

const DEFINITIONS: ReadonlyArray<FilterDefinition<Department>> = [
  {
    kind: "text",
    key: "search",
    label: "Search",
    placeholder: "Code, name or description…",
    span: 3,
    match: (row) => `${row.code} ${row.name} ${row.description ?? ""}`,
  },
  {
    kind: "select",
    key: "status",
    label: "Status",
    options: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
    ],
    match: (row, value) => row.isActive === (value === "active"),
  },
];


export function DepartmentsManager({
  departments,
  canManage,
}: {
  departments: Department[];
  canManage: boolean;
}) {
  const [removeState, removeAction] = useActionState(deleteDepartment, null);
  const { values, setValues, filtered, active, reset } = useFilterBar(departments, DEFINITIONS);

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

      <FilterBar
        definitions={DEFINITIONS}
        values={values}
        onChange={setValues}
        active={active}
        onReset={reset}
        total={departments.length}
        shown={filtered.length}
        noun={{ one: "department", many: "departments" }}
        actions={
          <>
            <DataToolbar master="departments" label="Departments" canImport={canManage} />
            {canManage ? (
            <Link href="/organisation/departments/new" className="btn-primary rounded-lg px-3 py-2 text-sm font-medium">
                New department
              </Link>
          ) : null}
          </>
        }
      />

      <MasterTable
        rows={filtered}
        rowKey={(department) => department.id}
        empty="No departments match these filters."
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
