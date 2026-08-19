"use client";

import { useRef, useState, type ReactNode } from "react";

import { formatBytes } from "./media-thumb";
import type { UploadEntry } from "./media-upload";

/**
 * The drop target and the progress list, shared by the library and the
 * picker.
 *
 * A dashed area that also holds a button, because drag-and-drop is invisible
 * until tried and a person on a laptop touchpad still needs a way in. The
 * `dragover` counter rather than a boolean stops the highlight flickering as
 * the pointer crosses child elements — the classic dragenter/dragleave bug.
 */
export function MediaDropzone({
  onFiles,
  accept,
  disabled,
  compact,
  children,
}: {
  onFiles: (files: FileList | File[]) => void;
  accept: string;
  disabled?: boolean;
  compact?: boolean;
  children?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [depth, setDepth] = useState(0);
  const active = depth > 0;

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault();
        setDepth((value) => value + 1);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setDepth((value) => Math.max(0, value - 1));
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        setDepth(0);
        if (!disabled && event.dataTransfer.files.length) onFiles(event.dataTransfer.files);
      }}
      className={`rounded-xl border-2 border-dashed transition-colors ${
        active ? "border-accent bg-accent-soft/40" : "border-line bg-surface-2/50"
      } ${compact ? "px-4 py-3" : "px-6 py-8"}`}
    >
      <div className={`flex ${compact ? "flex-row items-center justify-between gap-3" : "flex-col items-center gap-2 text-center"}`}>
        <div>
          <p className="text-sm font-medium text-fg">{active ? "Drop to upload" : "Drag files here"}</p>
          <p className="text-xs text-muted">Images, PDF, MP4 or MP3. Several at once is fine.</p>
        </div>
        <div className="flex items-center gap-2">
          {children}
          <button
            type="button"
            disabled={disabled}
            onClick={() => input.current?.click()}
            className="btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            Choose files
          </button>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept={accept}
        className="sr-only"
        onChange={(event) => {
          if (event.target.files?.length) onFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}

export function UploadList({ entries, onClear }: { entries: UploadEntry[]; onClear: () => void }) {
  if (entries.length === 0) return null;
  const finished = entries.every((entry) => entry.status === "done" || entry.status === "failed");
  return (
    <ul className="mt-3 space-y-1.5" aria-live="polite">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-lg border border-line bg-surface px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate font-medium text-fg">{entry.file.name}</span>
            <span className="shrink-0 tabular-nums text-muted">
              {entry.status === "failed"
                ? "Failed"
                : entry.status === "done"
                  ? "Uploaded"
                  : entry.status === "queued"
                    ? "Waiting"
                    : `${Math.round(entry.progress * 100)}%`}
              {" · "}
              {formatBytes(entry.file.size)}
            </span>
          </div>
          {entry.status === "failed" ? (
            <p className="mt-1 text-red-600 dark:text-red-400">{entry.error}</p>
          ) : (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
              <div
                className={`h-full rounded-full transition-[width] ${entry.status === "done" ? "bg-emerald-500" : "bg-accent"}`}
                style={{ width: `${Math.round(entry.progress * 100)}%` }}
              />
            </div>
          )}
        </li>
      ))}
      {finished ? (
        <li>
          <button type="button" onClick={onClear} className="text-xs text-muted underline-offset-2 hover:underline">
            Clear list
          </button>
        </li>
      ) : null}
    </ul>
  );
}
