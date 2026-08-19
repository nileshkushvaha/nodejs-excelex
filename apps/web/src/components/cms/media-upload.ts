"use client";

import { useCallback, useRef, useState } from "react";

import type { CmsMedia } from "@/lib/api";

/**
 * Uploading from the browser, with a bar per file.
 *
 * XMLHttpRequest rather than fetch, because fetch still cannot report upload
 * progress and a fifty-megabyte video with no bar looks broken. Files go one
 * at a time — the API measures images and hashes bytes per request, and
 * three uploads in parallel to the same origin only contend for the same
 * pipe — but each is tracked separately, so a refused file shows its own
 * reason and the rest carry on.
 */
export type UploadStatus = "queued" | "uploading" | "done" | "failed";

export interface UploadEntry {
  id: string;
  file: File;
  progress: number;
  status: UploadStatus;
  error?: string;
  result?: CmsMedia;
}

export interface UploadOptions {
  folder?: string | null;
  onUploaded?: (media: CmsMedia) => void;
  onSettled?: () => void;
}

/** What the API accepts; mirrored here only to warn before the round trip. */
export const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
  "application/pdf",
  "video/mp4",
  "audio/mpeg",
];

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp,image/svg+xml,image/avif";
export const ALL_ACCEPT = ACCEPTED_MIME_TYPES.join(",");

function uploadOne(entry: UploadEntry, folder: string | null | undefined, onProgress: (fraction: number) => void): Promise<CmsMedia> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", entry.file, entry.file.name);
    if (folder) form.append("folder", folder);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/cms/upload");
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new Error("The upload could not reach the server."));
    xhr.onload = () => {
      const body = xhr.response as { message?: string | string[]; code?: string } | CmsMedia | null;
      if (xhr.status >= 200 && xhr.status < 300 && body && "id" in body) {
        resolve(body);
        return;
      }
      const message =
        body && "message" in body && body.message
          ? Array.isArray(body.message)
            ? body.message[0]
            : body.message
          : xhr.status === 413
            ? "That file is larger than the upload limit."
            : `Upload failed (${xhr.status}).`;
      reject(new Error(message));
    };
    xhr.send(form);
  });
}

export function useMediaUploader(options: UploadOptions = {}) {
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const queue = useRef<UploadEntry[]>([]);
  const busy = useRef(false);
  const latest = useRef(options);
  latest.current = options;

  const patch = useCallback((id: string, change: Partial<UploadEntry>) => {
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)));
  }, []);

  const drain = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    while (queue.current.length > 0) {
      const entry = queue.current.shift()!;
      patch(entry.id, { status: "uploading", progress: 0 });
      try {
        const result = await uploadOne(entry, latest.current.folder, (fraction) => patch(entry.id, { progress: fraction }));
        patch(entry.id, { status: "done", progress: 1, result });
        latest.current.onUploaded?.(result);
      } catch (error) {
        patch(entry.id, { status: "failed", error: error instanceof Error ? error.message : "Upload failed." });
      }
    }
    busy.current = false;
    latest.current.onSettled?.();
  }, [patch]);

  const add = useCallback(
    (files: FileList | File[]) => {
      const fresh: UploadEntry[] = Array.from(files).map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        progress: 0,
        status: "queued",
      }));
      if (fresh.length === 0) return;
      setEntries((current) => [...fresh, ...current]);
      queue.current.push(...fresh);
      void drain();
    },
    [drain],
  );

  const clearFinished = useCallback(() => {
    setEntries((current) => current.filter((entry) => entry.status === "queued" || entry.status === "uploading"));
  }, []);

  const uploading = entries.some((entry) => entry.status === "queued" || entry.status === "uploading");
  return { entries, add, clearFinished, uploading };
}
