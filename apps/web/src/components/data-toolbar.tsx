"use client";

import { useState } from "react";

import { ImportDialog } from "@/components/import-dialog";

/**
 * Export and import, for any master.
 *
 * Both point at /data/<master>, which is one controller on the API driven by
 * a column spec — so a master gains this pair by being described, not by
 * three more endpoints and another dialog.
 *
 * The import button appears only when the person may import. That is a
 * courtesy, not the control: the API checks the same policy and refuses
 * regardless of what the screen chose to show.
 */
export function DataToolbar({
  master,
  label,
  canImport,
  query,
}: {
  /** The URL segment: zones, charges, consignees… */
  master: string;
  /** Plural, for the dialog's title. */
  label: string;
  canImport: boolean;
  /** Current filters, so an export matches what is on screen. */
  query?: string;
}) {
  const [importing, setImporting] = useState(false);

  return (
    <>
      <a
        href={`/api/v1/data/${master}/export${query ? `?${query}` : ""}`}
        className="btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
      >
        Export
      </a>

      {canImport ? (
        <button
          type="button"
          onClick={() => setImporting(true)}
          className="btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
        >
          Import
        </button>
      ) : null}

      <ImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        title={`Import ${label.toLowerCase()}`}
        endpoint={`/api/v1/data/${master}/import`}
        templateHref={`/api/v1/data/${master}/import/template`}
      />
    </>
  );
}
