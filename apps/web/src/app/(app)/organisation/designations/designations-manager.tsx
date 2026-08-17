"use client";

import Link from "next/link";
import { useActionState, useMemo } from "react";

import { FilterBar, useFilterBar, type FilterDefinition } from "@/components/filter-bar";
import { ActiveBadge, MasterTable } from "@/components/master-table";
import type { Department, Designation } from "@/lib/api";
import { deleteDesignation } from "../actions";


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

  const definitions = useMemo<ReadonlyArray<FilterDefinition<Designation>>>(
    () => [
      {
        kind: "text",
        key: "search",
        label: "Search",
        placeholder: "Code, title or description…",
        span: 3,
        match: (row) => `${row.code} ${row.name} ${row.description ?? ""}`,
      },
      {
        kind: "select",
        key: "departmentId",
        label: "Department",
        options: [
          // A title that sits above any one department is a real answer here,
          // not a blank, so it gets its own entry rather than being unreachable.
          { value: "none", label: "Company-wide" },
          ...departments.map((department) => ({ value: department.id, label: department.name })),
        ],
        match: (row, value) =>
          value === "none" ? row.department === null : row.department?.id === value,
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
    ],
    [departments],
  );

  const { values, setValues, filtered, active, reset } = useFilterBar(designations, definitions);

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
        definitions={definitions}
        values={values}
        onChange={setValues}
        active={active}
        onReset={reset}
        total={designations.length}
        shown={filtered.length}
        noun={{ one: "designation", many: "designations" }}
        actions={
          canManage ? (
            <Link href="/organisation/designations/new" className="btn-primary rounded-lg px-3 py-2 text-sm font-medium">
                New designation
              </Link>
          ) : null
        }
      />

      <MasterTable
        rows={filtered}
        rowKey={(designation) => designation.id}
        empty="No designations match these filters."
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
