"use client";

import { useState } from "react";

import { Field, formField } from "@/components/form-field";
import { Toggle } from "@/components/toggle";
import { MediaPicker } from "./media-picker";

/**
 * Search-engine fields, with the result they produce shown above them.
 *
 * The counters carry the numbers people actually check against — around 60
 * characters of title and 155 of description before Google truncates — and
 * turn amber past them rather than refusing, because the limit is a
 * heuristic and a slightly long description still beats none. The snippet
 * preview falls back to the content's title and excerpt, which is exactly
 * what the public site does when the meta fields are blank.
 */
export interface SeoValues {
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  noIndex: boolean;
  ogImage: { id: string; url: string } | null;
}

export function SeoPanel({
  values,
  onChange,
  fallbackTitle,
  fallbackDescription,
  path,
  siteTitle,
  disabled,
}: {
  values: SeoValues;
  onChange: (next: SeoValues) => void;
  fallbackTitle: string;
  fallbackDescription: string;
  path: string;
  siteTitle?: string;
  disabled?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const set = <K extends keyof SeoValues>(key: K, value: SeoValues[K]) => onChange({ ...values, [key]: value });

  const shownTitle = values.metaTitle || fallbackTitle || "Untitled";
  const shownDescription =
    values.metaDescription || fallbackDescription || "A description will be taken from the first lines of the body.";
  const host = typeof window !== "undefined" ? window.location.host : "example.com";

  return (
    <section className="card rounded-xl">
      <div className="border-b border-line px-5 py-3">
        <h2 className="text-sm font-semibold text-fg">Search appearance</h2>
        <p className="mt-0.5 text-xs text-muted">How this looks in a search result, and what the crawler is told.</p>
      </div>

      <div className="space-y-4 p-5">
        <div className="rounded-lg border border-line-soft bg-surface-2 p-3">
          <p className="truncate text-xs text-muted">
            {host}
            <span className="text-faint">{path}</span>
          </p>
          <p className="mt-0.5 truncate text-base text-[#1a0dab] dark:text-[#8ab4f8]">
            {shownTitle}
            {siteTitle ? <span className="text-muted"> · {siteTitle}</span> : null}
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted">{shownDescription}</p>
          {values.noIndex ? (
            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
              Marked noindex — search engines are asked not to list it.
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Meta title" hint={counter(values.metaTitle.length, 60)} span={2}>
            <input
              name="metaTitle"
              value={values.metaTitle}
              onChange={(event) => set("metaTitle", event.target.value)}
              placeholder={fallbackTitle}
              maxLength={200}
              disabled={disabled}
              className={formField}
            />
          </Field>
          <Field label="Meta description" hint={counter(values.metaDescription.length, 155)} span={2}>
            <textarea
              name="metaDescription"
              value={values.metaDescription}
              onChange={(event) => set("metaDescription", event.target.value)}
              rows={3}
              maxLength={320}
              disabled={disabled}
              className={formField}
            />
          </Field>
          <Field label="Canonical URL" hint="Leave blank unless this content also lives at another address." span={2}>
            <input
              name="canonicalUrl"
              type="url"
              value={values.canonicalUrl}
              onChange={(event) => set("canonicalUrl", event.target.value)}
              placeholder="https://"
              disabled={disabled}
              className={formField}
            />
          </Field>

          <div>
            <span className="mb-1 block text-xs font-medium text-muted">Social image</span>
            {values.ogImage ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={values.ogImage.url} alt="" className="h-14 w-24 rounded border border-line object-cover" />
                {!disabled ? (
                  <button type="button" onClick={() => set("ogImage", null)} className="text-xs text-muted hover:text-fg">
                    Remove
                  </button>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                disabled={disabled}
                onClick={() => setPickerOpen(true)}
                className="btn-secondary rounded-lg px-3 py-1.5 text-xs disabled:opacity-50"
              >
                Choose image
              </button>
            )}
          </div>

          <div className="pt-4">
            <Toggle
              name="noIndex"
              label="Hide from search engines"
              description="Adds a noindex robots directive."
              defaultChecked={values.noIndex}
              disabled={disabled}
              onChange={(checked) => set("noIndex", checked)}
            />
          </div>
        </div>
      </div>

      <MediaPicker
        open={pickerOpen}
        accept="image"
        onClose={() => setPickerOpen(false)}
        onSelect={(media) => {
          setPickerOpen(false);
          set("ogImage", { id: media.id, url: media.url });
        }}
      />
    </section>
  );
}

function counter(length: number, ideal: number): string {
  return length > ideal ? `${length} / ${ideal} — longer than most results show` : `${length} / ${ideal}`;
}
