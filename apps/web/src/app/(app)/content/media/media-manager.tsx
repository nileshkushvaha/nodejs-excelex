"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { MediaDropzone, UploadList } from "@/components/cms/media-dropzone";
import { formatBytes, kindOf, MediaThumb } from "@/components/cms/media-thumb";
import { ALL_ACCEPT, useMediaUploader } from "@/components/cms/media-upload";
import { FilterBar, type FilterDefinition } from "@/components/filter-bar";
import { Field, FormError, formField } from "@/components/form-field";
import { MasterTable } from "@/components/master-table";
import { Pager } from "@/components/pager";
import type { ActionResult, CmsMedia, CmsMediaFolder, CmsMediaPage } from "@/lib/api";
import { purgeMedia, refreshMediaLibrary, trashMedia, updateMedia } from "./actions";

/**
 * The media library.
 *
 * A grid by default because pictures are recognised, not read; a list for
 * when the question is "which of these is 4 MB" or "what did I upload on
 * Tuesday". Both are the same server page, so switching views never
 * refetches. Details live in a drawer beside the grid rather than a route:
 * an editor tidies alt text across a dozen files in a row, and a page load
 * per file would make that a chore. Uploads land at the top after a
 * refresh of the server page, so what was just uploaded is what is seen.
 */
export function MediaManager({
  page,
  folders,
  canManage,
  view,
}: {
  page: CmsMediaPage;
  folders: CmsMediaFolder[];
  canManage: boolean;
  view: "grid" | "list";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const uploader = useMediaUploader({
    folder: params.get("folder"),
    onSettled: () => startTransition(async () => {
      await refreshMediaLibrary();
      router.refresh();
    }),
  });

  const definitions = useMemo<ReadonlyArray<FilterDefinition<CmsMedia>>>(
    () => [
      { kind: "text", key: "search", label: "Search", placeholder: "File name, title or alt text…", span: 2 },
      {
        kind: "select",
        key: "mimeType",
        label: "Type",
        options: [
          { value: "image/", label: "Images" },
          { value: "video/", label: "Video" },
          { value: "audio/", label: "Audio" },
          { value: "application/pdf", label: "PDF" },
        ],
      },
      {
        kind: "select",
        key: "folder",
        label: "Folder",
        options: folders.map((row) => ({ value: row.folder, label: `${row.folder} (${row.count})` })),
      },
    ],
    [folders],
  );

  const values = Object.fromEntries(definitions.map((definition) => [definition.key, params.get(definition.key) ?? ""]));

  function apply(next: Record<string, string>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    query.delete("page");
    startTransition(() => router.replace(`${pathname}?${query.toString()}`));
  }

  function setView(next: "grid" | "list") {
    const query = new URLSearchParams(params.toString());
    if (next === "grid") query.delete("view");
    else query.set("view", next);
    startTransition(() => router.replace(`${pathname}?${query.toString()}`));
  }

  const open = openId ? (page.rows.find((row) => row.id === openId) ?? null) : null;

  return (
    <>
      <FilterBar
        definitions={definitions}
        values={values}
        onChange={apply}
        active={Object.values(values).some((value) => value !== "")}
        onReset={() => startTransition(() => router.replace(pathname))}
        total={page.total}
        shown={page.rows.length}
        noun={{ one: "file", many: "files" }}
        actions={
          <>
            <ViewToggle view={view} onChange={setView} />
            {canManage ? (
              <button
                type="button"
                onClick={() => setShowUpload((value) => !value)}
                className="btn-primary rounded-lg px-3 py-2 text-sm font-medium"
              >
                {showUpload ? "Hide upload" : "Upload"}
              </button>
            ) : null}
          </>
        }
      />

      {canManage && showUpload ? (
        <div className="mb-4">
          <MediaDropzone onFiles={uploader.add} accept={ALL_ACCEPT}>
            {params.get("folder") ? (
              <span className="text-xs text-muted">
                Into folder <span className="font-medium text-fg">{params.get("folder")}</span>
              </span>
            ) : null}
          </MediaDropzone>
          <UploadList entries={uploader.entries} onClear={uploader.clearFinished} />
        </div>
      ) : null}

      <div className={`grid gap-4 ${open ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : ""}`}>
        <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {view === "grid" ? (
            page.rows.length === 0 ? (
              <p className="card rounded-xl p-10 text-center text-sm text-muted">
                {page.total === 0 && !Object.values(values).some(Boolean)
                  ? "The library is empty. Upload something to begin."
                  : "No files match these filters."}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
                {page.rows.map((row) => (
                  <MediaThumb key={row.id} item={row} selected={row.id === openId} onClick={() => setOpenId(row.id === openId ? null : row.id)} />
                ))}
              </div>
            )
          ) : (
            <MasterTable
              rows={page.rows}
              rowKey={(row) => row.id}
              empty="No files match these filters."
              stickyLastColumn={false}
              columns={[
                {
                  header: "File",
                  cell: (row) => (
                    <button type="button" onClick={() => setOpenId(row.id)} className="flex items-center gap-3 text-left">
                      <span className="block w-10 shrink-0">
                        <MediaThumb item={row} size="sm" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-fg">{row.title || row.fileName}</span>
                        <span className="block truncate text-xs text-muted">{row.fileName}</span>
                      </span>
                    </button>
                  ),
                },
                { header: "Type", cell: (row) => <span className="text-xs text-muted">{row.mimeType}</span> },
                {
                  header: "Size",
                  cell: (row) => (
                    <span className="tabular-nums text-xs text-muted">
                      {formatBytes(row.sizeBytes)}
                      {row.width ? ` · ${row.width}×${row.height}` : ""}
                    </span>
                  ),
                },
                { header: "Folder", cell: (row) => <span className="text-xs text-muted">{row.folder ?? "—"}</span> },
                { header: "Uploaded by", cell: (row) => <span className="text-xs text-muted">{row.uploadedBy?.fullName ?? "—"}</span> },
                {
                  header: "Uploaded",
                  cell: (row) => <span className="tabular-nums text-xs text-muted">{formatWhen(row.createdAt)}</span>,
                },
              ]}
            />
          )}
          <Pager page={page.page} pageCount={page.pageCount} total={page.total} pageSize={page.pageSize} />
        </div>

        {open ? (
          <MediaDetails
            key={open.id}
            media={open}
            canManage={canManage}
            folders={folders}
            onClose={() => setOpenId(null)}
            onRemoved={() => {
              setOpenId(null);
              router.refresh();
            }}
          />
        ) : null}
      </div>
    </>
  );
}

function ViewToggle({ view, onChange }: { view: "grid" | "list"; onChange: (view: "grid" | "list") => void }) {
  const button = (value: "grid" | "list", label: string) => (
    <button
      type="button"
      onClick={() => onChange(value)}
      aria-pressed={view === value}
      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
        view === value ? "bg-surface text-fg shadow-sm ring-1 ring-line" : "text-muted hover:text-fg"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg bg-surface-3 p-0.5" role="group" aria-label="View">
      {button("grid", "Grid")}
      {button("list", "List")}
    </div>
  );
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * The details drawer: preview, the URL to copy, the fields worth editing,
 * and the two kinds of delete. "Delete" hides the file and stops serving it;
 * "Delete permanently" removes the bytes and cannot be undone, so it asks.
 */
function MediaDetails({
  media,
  canManage,
  folders,
  onClose,
  onRemoved,
}: {
  media: CmsMedia;
  canManage: boolean;
  folders: CmsMediaFolder[];
  onClose: () => void;
  onRemoved: () => void;
}) {
  const [title, setTitle] = useState(media.title ?? "");
  const [altText, setAltText] = useState(media.altText ?? "");
  const [caption, setCaption] = useState(media.caption ?? "");
  const [folder, setFolder] = useState(media.folder ?? "");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [saving, startSaving] = useTransition();
  const [copied, setCopied] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const kind = kindOf(media.mimeType);

  const dirty =
    title !== (media.title ?? "") || altText !== (media.altText ?? "") || caption !== (media.caption ?? "") || folder !== (media.folder ?? "");

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const absoluteUrl = typeof window === "undefined" || media.url.startsWith("http") ? media.url : `${window.location.origin}${media.url}`;

  function save() {
    startSaving(async () => {
      const outcome = await updateMedia(media.id, {
        title: title.trim() || null,
        altText: altText.trim() || null,
        caption: caption.trim() || null,
        folder: folder.trim() || null,
      });
      setResult(outcome);
    });
  }

  function remove(permanent: boolean) {
    startSaving(async () => {
      const outcome = permanent ? await purgeMedia(media.id) : await trashMedia(media.id);
      if (outcome.ok) onRemoved();
      else setResult(outcome);
    });
  }

  return (
    <aside className="card h-fit rounded-xl p-4 lg:sticky lg:top-4" aria-label="File details">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-fg" title={media.fileName}>
            {media.fileName}
          </h2>
          <p className="text-xs text-muted">
            {media.mimeType} · {formatBytes(media.sizeBytes)}
            {media.width ? ` · ${media.width}×${media.height}` : ""}
          </p>
        </div>
        <button type="button" onClick={onClose} className="btn-secondary rounded-md px-2 py-1 text-xs" aria-label="Close details">
          ✕
        </button>
      </div>

      <div className="mb-3 overflow-hidden rounded-lg bg-surface-3">
        {kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.url} alt={media.altText ?? ""} className="mx-auto max-h-56 w-auto max-w-full object-contain" />
        ) : kind === "video" ? (
          <video src={media.url} controls className="max-h-56 w-full" preload="metadata" />
        ) : kind === "audio" ? (
          <audio src={media.url} controls className="w-full p-3" preload="metadata" />
        ) : (
          <a href={media.url} target="_blank" rel="noopener" className="block p-6 text-center text-sm text-accent-text hover:underline">
            Open {kind === "pdf" ? "PDF" : "file"} in a new tab
          </a>
        )}
      </div>

      <div className="mb-3">
        <span className="mb-1 block text-xs font-medium text-muted">URL</span>
        <div className="flex gap-1.5">
          <input readOnly value={media.url} className={`${formField} font-mono text-xs`} onFocus={(event) => event.currentTarget.select()} />
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(absoluteUrl).then(() => setCopied(true));
            }}
            className="btn-secondary shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">Uploaded by</dt>
        <dd className="truncate text-fg">{media.uploadedBy?.fullName ?? "—"}</dd>
        <dt className="text-muted">Uploaded</dt>
        <dd className="tabular-nums text-fg">{formatWhen(media.createdAt)}</dd>
      </dl>

      <FormError message={result?.ok === false ? result.error : undefined} />
      {result?.ok ? <p className="mb-2 text-xs text-emerald-600 dark:text-emerald-400">Saved.</p> : null}

      <div className="space-y-2.5">
        <Field label="Title">
          <input value={title} onChange={(event) => setTitle(event.target.value)} disabled={!canManage} className={formField} maxLength={200} />
        </Field>
        <Field label="Alt text" hint={kind === "image" ? "What the image shows, for people who cannot see it." : undefined}>
          <input value={altText} onChange={(event) => setAltText(event.target.value)} disabled={!canManage} className={formField} maxLength={500} />
        </Field>
        <Field label="Caption">
          <textarea value={caption} onChange={(event) => setCaption(event.target.value)} disabled={!canManage} className={formField} rows={2} maxLength={1000} />
        </Field>
        <Field label="Folder" hint="A label to filter by. Type a new one to create it.">
          <input
            value={folder}
            onChange={(event) => setFolder(event.target.value)}
            disabled={!canManage}
            className={formField}
            list="media-folders"
            maxLength={100}
          />
        </Field>
        <datalist id="media-folders">
          {folders.map((row) => (
            <option key={row.folder} value={row.folder} />
          ))}
        </datalist>
      </div>

      {canManage ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="btn-primary rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <span className="flex-1" />
          {confirmPurge ? (
            <>
              <span className="text-xs text-red-600 dark:text-red-400">Remove the file for good?</span>
              <button
                type="button"
                onClick={() => remove(true)}
                disabled={saving}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Yes, delete permanently
              </button>
              <button type="button" onClick={() => setConfirmPurge(false)} className="btn-secondary rounded-lg px-2.5 py-1.5 text-xs">
                Keep
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => remove(false)}
                disabled={saving}
                className="btn-secondary rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                title="Hides the file from the library and the site; the bytes are kept."
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmPurge(true)}
                disabled={saving}
                className="rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
              >
                Delete permanently
              </button>
            </>
          )}
        </div>
      ) : null}
    </aside>
  );
}
