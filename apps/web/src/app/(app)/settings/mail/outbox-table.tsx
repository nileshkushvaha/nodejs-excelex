"use client";

import { MasterTable } from "@/components/master-table";
import { Pager } from "@/components/pager";
import { StatusPill } from "@/components/status-pill";
import type { MailMessagePage, MailMessageRow } from "@/lib/api";

const tone = (status: MailMessageRow["status"]) => (status === "SENT" ? "green" : status === "FAILED" ? "red" : "amber");

export function OutboxTable({ page }: { page: MailMessagePage | null }) {
  if (!page) return <p className="text-sm text-muted">The outbox could not be loaded.</p>;
  return (
    <>
      <MasterTable
        rows={page.rows}
        rowKey={(row) => row.id}
        stickyLastColumn={false}
        empty="Nothing has been sent yet. The first message will usually be a password reset or a test."
        columns={[
          { header: "When", cell: (row) => <span className="tabular-nums text-xs">{new Date(row.createdAt).toLocaleString("en-IN")}</span> },
          { header: "To", cell: (row) => <span className="text-sm">{row.to}</span> },
          { header: "Subject", cell: (row) => <span className="text-sm">{row.subject}</span> },
          { header: "Template", cell: (row) => <span className="font-mono text-xs text-muted">{row.template}</span> },
          {
            header: "Status",
            cell: (row) => (
              <span className="flex flex-col gap-0.5">
                <StatusPill tone={tone(row.status)}>{row.status.toLowerCase()}</StatusPill>
                {row.error ? <span className="max-w-xs truncate text-xs text-red-700 dark:text-red-300" title={row.error}>{row.error}</span> : null}
              </span>
            ),
          },
        ]}
      />
      <Pager page={page.page} pageCount={page.pageCount} total={page.total} pageSize={page.pageSize} />
    </>
  );
}
