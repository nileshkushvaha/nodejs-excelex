"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { MasterDialog } from "@/components/master-dialog";
import type { CmsMedia } from "@/lib/api";
import { fetchMediaPage } from "./media-actions";
import { MediaDropzone, UploadList } from "./media-dropzone";
import { formatBytes, MediaThumb } from "./media-thumb";
import { ALL_ACCEPT, IMAGE_ACCEPT, useMediaUploader } from "./media-upload";

/**
 * Choose a file from the library without leaving the editor.
 *
 * A modal over the current screen rather than a trip to /content/media,
 * because the person is halfway through a paragraph and wants an image in
 * it. Search, a grid, and upload-in-place — a fresh upload is selected as
 * soon as it lands, since "upload and then find it" is two steps for one
 * intention. Selection is single: the editor inserts one image at a time.
 */
export interface MediaPickerSelection {
  id: string;
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
  mimeType: string;
  fileName: string;
  title: string | null;
  caption: string | null;
}

export interface MediaPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (media: MediaPickerSelection) => void;
  /** Images only (the default for an image field), or anything the library holds. */
  accept?: "image" | "all";
  title?: string;
}

const PAGE_SIZE = 24;

export function toSelection(media: CmsMedia): MediaPickerSelection {
  return {
    id: media.id,
    url: media.url,
    altText: media.altText,
    width: media.width,
    height: media.height,
    mimeType: media.mimeType,
    fileName: media.fileName,
    title: media.title,
    caption: media.caption,
  };
}

export function MediaPicker({ open, onClose, onSelect, accept = "image", title }: MediaPickerProps) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<CmsMedia[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<CmsMedia | null>(null);
  const [refused, setRefused] = useState(false);
  const [loading, startLoading] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const uploader = useMediaUploader({
    onUploaded: (media) => {
      setRows((current) => [media, ...current]);
      setSelected(media);
    },
  });

  function load(nextPage: number, term: string) {
    startLoading(async () => {
      const result = await fetchMediaPage({
        page: nextPage,
        pageSize: PAGE_SIZE,
        search: term || undefined,
        mimeType: accept === "image" ? "image/" : undefined,
      });
      if (!result) {
        setRefused(true);
        return;
      }
      setRefused(false);
      setRows((current) => (nextPage === 1 ? result.rows : [...current, ...result.rows]));
      setPage(result.page);
      setPageCount(result.pageCount);
      setTotal(result.total);
    });
  }

  // Fresh each time it opens: the library may have changed since.
  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setSearch("");
    load(1, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, accept]);

  function onSearch(value: string) {
    setSearch(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(1, value), 250);
  }

  function choose() {
    if (!selected) return;
    onSelect(toSelection(selected));
    onClose();
  }

  return (
    <MasterDialog
      open={open}
      onClose={onClose}
      wide
      title={title ?? (accept === "image" ? "Choose an image" : "Choose a file")}
      description="Pick from the library or upload something new."
    >
      <div className="space-y-3">
        <MediaDropzone onFiles={uploader.add} accept={accept === "image" ? IMAGE_ACCEPT : ALL_ACCEPT} compact />
        <UploadList entries={uploader.entries} onClear={uploader.clearFinished} />

        <div className="flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search by file name, title or alt text…"
            className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
          />
          <span className="shrink-0 text-xs tabular-nums text-muted">{total} in library</span>
        </div>

        {refused ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
            You do not hold <code className="font-mono">cms.media.view</code>.
          </p>
        ) : (
          <div className={`max-h-[50vh] overflow-y-auto pr-1 ${loading ? "opacity-70" : ""}`}>
            {rows.length === 0 && !loading ? (
              <p className="py-10 text-center text-sm text-muted">Nothing here yet. Upload a file to begin.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {rows.map((row) => (
                  <MediaThumb key={row.id} item={row} size="sm" selected={selected?.id === row.id} onClick={() => setSelected(row)} />
                ))}
              </div>
            )}
            {page < pageCount ? (
              <div className="mt-3 text-center">
                <button
                  type="button"
                  onClick={() => load(page + 1, search)}
                  disabled={loading}
                  className="btn-secondary rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  Show more
                </button>
              </div>
            ) : null}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
          <p className="min-w-0 truncate text-xs text-muted">
            {selected
              ? `${selected.fileName} · ${formatBytes(selected.sizeBytes)}${selected.width ? ` · ${selected.width}×${selected.height}` : ""}`
              : "Select a file to continue."}
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onClose} className="btn-secondary rounded-lg px-3 py-2 text-sm font-medium">
              Cancel
            </button>
            <button
              type="button"
              onClick={choose}
              disabled={!selected}
              className="btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              Use this file
            </button>
          </div>
        </div>
      </div>
    </MasterDialog>
  );
}
