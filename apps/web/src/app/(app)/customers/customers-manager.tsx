"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useMemo, useTransition } from "react";

import { FilterBar, type FilterDefinition } from "@/components/filter-bar";
import { ActiveBadge, MasterTable } from "@/components/master-table";
import type { CustomerPage, CustomerRow } from "@/lib/api";
import { deleteCustomer } from "./actions";

type Option = { id: string; code: string; name: string };

/**
 * The customer list.
 *
 * The only master that filters in SQL rather than in the browser. It runs to
 * thousands of rows per client, so the bar writes its values into the URL and
 * the server answers them — which also means a filtered list is a link, and
 * the back button does what the address bar says it will.
 *
 * That is the one trade: each change is a round trip rather than instant. It
 * is hidden behind a transition so the table dims rather than blanking, and
 * typing is not sent until it stops.
 */
export function CustomersManager({
  page,
  branches,
  centres,
  canManage,
}: {
  page: CustomerPage;
  branches: Option[];
  centres: Option[];
  canManage: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [removeState, removeAction] = useActionState(deleteCustomer, null);

  // No match functions: every one of these is answered by the query, not by
  // filtering rows the browser never received.
  const definitions = useMemo<ReadonlyArray<FilterDefinition<CustomerRow>>>(
    () => [
      { kind: "text", key: "search", label: "Search", placeholder: "Code, name, contact, phone or email…", span: 3 },
      {
        kind: "select",
        key: "branchId",
        label: "Branch",
        options: branches.map((row) => ({ value: row.id, label: `${row.code} — ${row.name}` })),
      },
      {
        kind: "select",
        key: "serviceCentreId",
        label: "Service centre",
        options: centres.map((row) => ({ value: row.id, label: row.name })),
      },
      {
        kind: "select",
        key: "customerType",
        label: "Type",
        options: [
          { value: "CUSTOMER", label: "Customer" },
          { value: "CO_COURIER", label: "Co-courier" },
          { value: "FRANCHISEE", label: "Franchisee" },
        ],
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
    [branches, centres],
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
    // Any filter change invalidates the page number: page 7 of the old result
    // is rarely a page of the new one.
    query.delete("page");
    startTransition(() => router.replace(`${pathname}?${query.toString()}`));
  }

  function goTo(target: number) {
    const query = new URLSearchParams(params.toString());
    query.set("page", String(target));
    startTransition(() => router.replace(`${pathname}?${query.toString()}`));
  }

  const from = (page.page - 1) * page.pageSize + 1;
  const to = Math.min(page.total, page.page * page.pageSize);

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
        noun={{ one: "customer", many: "customers" }}
        actions={
          canManage ? (
            <Link href="/customers/new" className="btn-primary rounded-lg px-3 py-2 text-sm font-medium">
              New customer
            </Link>
          ) : null
        }
      />

      {/* Dimmed rather than replaced while the next page loads: a table that
          blanks on every keystroke reads as broken. */}
      <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <MasterTable
          rows={page.rows}
          rowKey={(row) => row.id}
          empty="No customers match these filters."
          columns={[
            {
              header: "Customer Code",
              cell: (row) => <span className="font-mono text-xs font-medium text-fg">{row.code}</span>,
            },
            {
              header: "Branch",
              cell: (row) => <span className="text-xs text-muted">{row.branch?.code ?? "—"}</span>,
            },
            {
              header: "Service Centre",
              cell: (row) => <span className="text-xs text-muted">{row.serviceCentre?.name ?? "—"}</span>,
            },
            { header: "Name", cell: (row) => <span className="text-fg">{row.name}</span> },
            {
              header: "Contact",
              cell: (row) => <span className="text-xs text-muted">{row.contactPerson ?? "—"}</span>,
            },
            {
              header: "Phone",
              cell: (row) => (
                <span className="font-mono text-xs tabular-nums text-muted">{row.mobile ?? "—"}</span>
              ),
            },
            {
              header: "Email",
              cell: (row) => <span className="text-xs text-muted">{row.email ?? "—"}</span>,
            },
            { header: "Status", cell: (row) => <ActiveBadge active={row.isActive} /> },
            {
              header: "Contract Head",
              cell: (row) => <span className="text-xs text-muted">{row.contractHead ?? "—"}</span>,
            },
            {
              header: "Action",
              className: "text-right",
              cell: (row) => (
                <span className="flex justify-end gap-2">
                  <Link
                    href={`/customers/${row.id}`}
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

      {page.pageCount > 1 ? (
        <nav className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label="Pagination">
          <p className="text-xs text-muted">
            Showing {from.toLocaleString()}–{to.toLocaleString()} of {page.total.toLocaleString()}
          </p>

          <div className="flex items-center gap-1.5">
            <PageButton label="Previous" disabled={page.page <= 1} onClick={() => goTo(page.page - 1)} />
            <span className="px-2 text-xs tabular-nums text-muted">
              Page {page.page} of {page.pageCount}
            </span>
            <PageButton
              label="Next"
              disabled={page.page >= page.pageCount}
              onClick={() => goTo(page.page + 1)}
            />
          </div>
        </nav>
      ) : null}
    </>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="btn-secondary rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40"
    >
      {label}
    </button>
  );
}
