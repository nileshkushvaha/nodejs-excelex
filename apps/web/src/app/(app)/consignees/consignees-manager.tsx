"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useMemo, useTransition } from "react";

import { FilterBar, type FilterDefinition } from "@/components/filter-bar";
import { ActiveBadge, MasterTable } from "@/components/master-table";
import { Pager } from "@/components/pager";
import type { Consignee, ConsigneePage, Destination } from "@/lib/api";
import { deleteConsignee } from "./actions";

type Option = { id: string; code: string; name: string };

/**
 * The consignee list.
 *
 * Server-paged like customers, because this is the master that grows fastest:
 * every address anyone has delivered to lands here and none of them are ever
 * really deleted.
 */
export function ConsigneesManager({
  page,
  destinations,
  centres,
  canManage,
}: {
  page: ConsigneePage;
  destinations: Destination[];
  centres: Option[];
  canManage: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [removeState, removeAction] = useActionState(deleteConsignee, null);

  // No match functions: the query answers these, not the browser.
  const definitions = useMemo<ReadonlyArray<FilterDefinition<Consignee>>>(
    () => [
      { kind: "text", key: "search", label: "Search", placeholder: "Code, name, address or phone…", span: 3 },
      {
        kind: "select",
        key: "destinationId",
        label: "Destination",
        options: destinations.map((row) => ({ value: row.id, label: `${row.code} — ${row.name}` })),
      },
      {
        kind: "select",
        key: "serviceCentreId",
        label: "Service centre",
        options: centres.map((row) => ({ value: row.id, label: row.name })),
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
    [centres, destinations],
  );

  const values = Object.fromEntries(
    definitions.map((definition) => [definition.key, params.get(definition.key) ?? ""]),
  );
  const active = Object.values(values).some((value) => value !== "");

  function apply(next: Record<string, string>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    // Page 7 of the old result is rarely a page of the new one.
    query.delete("page");
    startTransition(() => router.replace(`${pathname}?${query.toString()}`));
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

      <FilterBar
        definitions={definitions}
        values={values}
        onChange={apply}
        active={active}
        onReset={() => startTransition(() => router.replace(pathname))}
        total={page.total}
        shown={page.rows.length}
        noun={{ one: "consignee", many: "consignees" }}
        actions={
          <>
            <a
              href={`/api/v1/masters/consignees/export?${params.toString()}`}
              className="btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
            >
              Export
            </a>
            {canManage ? (
              <Link href="/consignees/new" className="btn-primary rounded-lg px-3 py-2 text-sm font-medium">
                New consignee
              </Link>
            ) : null}
          </>
        }
      />

      <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <MasterTable
          rows={page.rows}
          rowKey={(row) => row.id}
          empty="No consignees match these filters."
          columns={[
            {
              header: "Destination Code",
              cell: (row) => (
                <span className="font-mono text-xs text-muted">{row.destination?.code ?? "—"}</span>
              ),
            },
            {
              header: "Consignee Code",
              cell: (row) => <span className="font-mono text-xs font-medium text-fg">{row.code}</span>,
            },
            { header: "Consignee Name", cell: (row) => <span className="text-fg">{row.name}</span> },
            {
              header: "Address1",
              cell: (row) => <span className="text-xs text-muted">{row.addressLine1 ?? "—"}</span>,
            },
            {
              header: "Telephone1",
              cell: (row) => (
                <span className="font-mono text-xs tabular-nums text-muted">{row.telephone1 ?? "—"}</span>
              ),
            },
            {
              header: "Telephone2",
              cell: (row) => (
                <span className="font-mono text-xs tabular-nums text-muted">{row.telephone2 ?? "—"}</span>
              ),
            },
            { header: "Status", cell: (row) => <ActiveBadge active={row.isActive} /> },
            {
              header: "Action",
              className: "text-right",
              cell: (row) => (
                <span className="flex justify-end gap-2">
                  <Link
                    href={`/consignees/${row.id}`}
                    className="rounded border border-line-strong px-2 py-1 text-xs text-fg transition-colors hover:border-accent hover:bg-surface-2"
                  >
                    {canManage ? "Edit" : "View"}
                  </Link>
                  {canManage ? (
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
                  ) : null}
                </span>
              ),
            },
          ]}
        />
      </div>

      <Pager page={page.page} pageCount={page.pageCount} total={page.total} pageSize={page.pageSize} />
    </>
  );
}
