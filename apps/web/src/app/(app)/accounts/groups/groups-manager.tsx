"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FilterBar, useFilterBar, type FilterDefinition } from "@/components/filter-bar";
import { ActiveBadge, MasterTable } from "@/components/master-table";
import type { AccountGroup } from "@/lib/api";
import { deleteAccountGroup } from "./actions";

const DEFINITIONS: ReadonlyArray<FilterDefinition<AccountGroup>> = [
  {
    kind: "text",
    key: "search",
    label: "Search",
    placeholder: "Code, name or parent…",
    span: 3,
    match: (row) => `${row.code} ${row.name} ${row.parent?.name ?? ""}`,
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

export function GroupsManager({
  groups,
  canManage,
}: {
  groups: AccountGroup[];
  canManage: boolean;
}) {
  const [removeState, removeAction] = useActionState(deleteAccountGroup, null);
  const { values, setValues, filtered, active, reset } = useFilterBar(groups, DEFINITIONS);

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
        total={groups.length}
        shown={filtered.length}
        noun={{ one: "group", many: "groups" }}
        actions={
          canManage ? (
            <Link
              href="/accounts/groups/new"
              className="btn-primary rounded-lg px-3 py-2 text-sm font-medium"
            >
              New group
            </Link>
          ) : null
        }
      />

      <MasterTable
        rows={filtered}
        rowKey={(row) => row.id}
        empty="No groups match these filters."
        columns={[
          {
            header: "Group Code",
            cell: (row) => <span className="font-mono text-xs font-medium text-fg">{row.code}</span>,
          },
          { header: "Group Name", cell: (row) => <span className="text-fg">{row.name}</span> },
          {
            header: "Under Group",
            cell: (row) =>
              row.parent ? (
                <span className="text-xs text-muted">{row.parent.name}</span>
              ) : (
                // A root of the tree, not a missing value.
                <span className="text-xs italic text-faint">Top level</span>
              ),
          },
          {
            header: "Subgroups",
            cell: (row) => (
              // What makes a group deletable, so it belongs on the row rather
              // than only in the error you get for trying.
              <span className="text-xs tabular-nums text-muted">{row.childCount}</span>
            ),
          },
          { header: "Status", cell: (row) => <ActiveBadge active={row.isActive} /> },
          {
            header: "Action",
            className: "text-right",
            cell: (row) =>
              canManage ? (
                <span className="flex justify-end gap-2">
                  <Link
                    href={`/accounts/groups/${row.id}`}
                    className="rounded border border-line-strong px-2 py-1 text-xs text-fg transition-colors hover:border-accent hover:bg-surface-2"
                  >
                    Edit
                  </Link>
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
    </>
  );
}
