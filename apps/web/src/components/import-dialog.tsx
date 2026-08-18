"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { MasterDialog } from "@/components/master-dialog";
import type { ImportReport } from "@/lib/api";

/**
 * Spreadsheet import: choose a file, see exactly what would change, then commit.
 *
 * The preview is not skippable. A product list arrives as a spreadsheet that has
 * been through several hands, and the useful question is never "did it work" but
 * "what is about to change" — which is only answerable before the write.
 *
 * This one posts directly rather than through a server action: server actions
 * carry FormData fine, but the two-step preview/commit needs the parsed report
 * back in component state, and routing a file upload through an action to
 * achieve that adds a hop without adding anything.
 */
export function ImportDialog({
  open,
  onClose,
  title = "Import products",
  endpoint = "/api/v1/masters/products/import",
  templateHref = "/api/v1/masters/products/import/template",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  endpoint?: string;
  templateHref?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setFile(null);
    setReport(null);
    setError(null);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function send(mode: "preview" | "commit") {
    if (!file) return;
    setBusy(true);
    setError(null);

    const body = new FormData();
    body.append("file", file);

    try {
      const response = await fetch(`${endpoint}?mode=${mode}`, {
        method: "POST",
        body,
      });

      const payload = (await response.json()) as ImportReport & { message?: string | string[] };

      if (!response.ok) {
        const message = Array.isArray(payload.message) ? payload.message[0] : payload.message;
        setError(message ?? `The import failed (${response.status}).`);
        return;
      }

      setReport(payload);

      if (mode === "commit" && !payload.aborted) {
        // The list behind the dialog is a server component, so it only reflects
        // the import after the server re-renders it.
        router.refresh();
      }
    } catch {
      setError("Could not reach the server. Nothing was imported.");
    } finally {
      setBusy(false);
    }
  }

  const committed = report?.mode === "commit" && !report.aborted;

  return (
    <MasterDialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={title}
      description="Upload an .xlsx or .csv. Nothing is written until you confirm the preview."
    >
      <div className="space-y-4">
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
          >
            {error}
          </p>
        ) : null}

        {!committed ? (
          <>
            <div className="rounded-lg border border-dashed border-line-strong bg-surface-2 p-4 text-center transition-colors hover:border-accent">
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.csv"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setReport(null);
                  setError(null);
                }}
                className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-[image:var(--brand-gradient)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:cursor-pointer"
              />
              <p className="mt-2 text-xs text-muted">
                Columns are matched by heading, so “Product Code”, “product_code” and “PRODUCT CODE”
                are all accepted.{" "}
                <a
                  href={templateHref}
                  className="text-accent-text underline"
                >
                  Download a template
                </a>
                .
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => send("preview")}
                disabled={!file || busy}
                className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {busy && !report ? "Checking…" : "Check file"}
              </button>

              {report && !report.aborted && report.failed === 0 ? (
                <button
                  type="button"
                  onClick={() => send("commit")}
                  disabled={busy}
                  className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
                >
                  {busy ? "Importing…" : `Import ${report.total} ${report.total === 1 ? "row" : "rows"}`}
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  reset();
                  onClose();
                }}
                className="btn-secondary rounded-lg px-4 py-2 text-sm font-medium"
              >
                Close
              </button>
            </div>
          </>
        ) : null}

        {report ? <Report report={report} onDone={() => { reset(); onClose(); }} /> : null}
      </div>
    </MasterDialog>
  );
}

function Report({ report, onDone }: { report: ImportReport; onDone: () => void }) {
  const errors = report.outcomes.filter((outcome) => outcome.status === "error");
  const skipped = report.outcomes.filter((outcome) => outcome.status === "skipped");
  const committed = report.mode === "commit" && !report.aborted;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label={committed ? "Created" : "To create"} value={committed ? report.created : report.outcomes.filter((o) => o.status === "create").length} tone="good" />
        <Stat label={committed ? "Updated" : "To update"} value={committed ? report.updated : report.outcomes.filter((o) => o.status === "update").length} tone="info" />
        <Stat label="Errors" value={report.failed} tone={report.failed > 0 ? "bad" : "muted"} />
      </div>

      {/* Shown before the outcome, not after: a column the importer refused
          is something to know while deciding whether to commit, not a
          footnote once the write has happened. */}
      {skipped.map((outcome) => (
        <p
          key={`skipped-${outcome.row}`}
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300"
        >
          {outcome.message}
        </p>
      ))}

      {report.aborted ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
          <strong>Nothing was imported.</strong> {report.failed} row
          {report.failed === 1 ? "" : "s"} could not be read, and a half-applied file is worse than
          none — nobody could say afterwards which rows had landed. Fix the rows below and upload
          again.
        </p>
      ) : null}

      {committed ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
          Imported. {report.created} created, {report.updated} updated.
        </p>
      ) : null}

      {errors.length > 0 ? (
        <div className="max-h-56 overflow-y-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 brand-gradient-soft border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Row</th>
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Problem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {errors.map((outcome) => (
                <tr key={`${outcome.row}-${outcome.code}`}>
                  {/* The row number is the one in Excel's own gutter, so it can
                      be found without counting. */}
                  <td className="px-3 py-1.5 tabular-nums text-muted">{outcome.row}</td>
                  <td className="px-3 py-1.5 font-mono text-xs text-fg">{outcome.code}</td>
                  <td className="px-3 py-1.5 text-xs text-red-700 dark:text-red-300">
                    {outcome.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {committed ? (
        <button type="button" onClick={onDone} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">
          Done
        </button>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "info" | "bad" | "muted";
}) {
  const colour = {
    good: "text-emerald-700 dark:text-emerald-400",
    info: "text-accent-text",
    bad: "text-red-700 dark:text-red-300",
    muted: "text-muted",
  }[tone];

  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-center">
      <p className={`text-lg font-semibold tabular-nums ${colour}`}>{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}
