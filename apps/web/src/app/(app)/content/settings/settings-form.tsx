"use client";

import { useState, useTransition } from "react";

import { MediaPicker } from "@/components/cms/media-picker";
import { Field, FormError, formField } from "@/components/form-field";
import { SettingsCard } from "@/components/settings-card";
import { Toggle } from "@/components/toggle";
import type { ActionResult, CmsSiteSettings } from "@/lib/api";
import { saveSiteSettings, type SiteSettingsInput } from "./actions";

/**
 * The site settings form, held in state rather than read from inputs on
 * submit: the social links repeater and the image picker are not plain
 * fields, and building the body from one object keeps the shape the API
 * expects in one place.
 */
export function SiteSettingsForm({
  settings,
  pages,
  canManage,
}: {
  settings: CmsSiteSettings;
  pages: ReadonlyArray<{ id: string; title: string; path: string }>;
  canManage: boolean;
}) {
  const [values, setValues] = useState<SiteSettingsInput>({
    siteTitle: settings.siteTitle,
    tagline: settings.tagline,
    homePageId: settings.homePageId,
    blogPath: settings.blogPath,
    postsPerPage: settings.postsPerPage,
    footerText: settings.footerText,
    socialLinks: settings.socialLinks ?? [],
    defaultMetaDescription: settings.defaultMetaDescription,
    defaultOgImageId: settings.defaultOgImage?.id ?? null,
    indexable: settings.indexable,
  });
  const [ogImage, setOgImage] = useState(settings.defaultOgImage);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof SiteSettingsInput>(key: K, value: SiteSettingsInput[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  const text = (value: string) => value.trim() || null;
  const disabled = !canManage;

  // The home page select offers published pages, plus the current choice if
  // it has since been unpublished — so the form does not silently drop it.
  const homeOptions =
    settings.homePage && !pages.some((page) => page.id === settings.homePage?.id)
      ? [{ id: settings.homePage.id, title: `${settings.homePage.title} (not published)`, path: `/${settings.homePage.slug}` }, ...pages]
      : pages;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      setResult(await saveSiteSettings({ ...values, socialLinks: values.socialLinks.filter((link) => link.label.trim() || link.url.trim()) }));
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <FormError result={result} />
      {result?.ok ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
          Saved.
        </p>
      ) : null}

      <SettingsCard title="Identity" description="The name in the browser tab and the header, and the line under it.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Site title" error={result?.fieldErrors?.siteTitle}>
            <input name="siteTitle" required maxLength={120} value={values.siteTitle} onChange={(event) => set("siteTitle", event.target.value)} disabled={disabled} className={formField} />
          </Field>
          <Field label="Tagline" hint="A few words; shown next to the title where there is room.">
            <input name="tagline" maxLength={200} value={values.tagline ?? ""} onChange={(event) => set("tagline", text(event.target.value))} disabled={disabled} className={formField} />
          </Field>
          <Field label="Home page" hint="Left unset, the site shows its built-in front page." span={2}>
            <select name="homePageId" value={values.homePageId ?? ""} onChange={(event) => set("homePageId", event.target.value || null)} disabled={disabled} className={formField}>
              <option value="">— Built-in home page —</option>
              {homeOptions.map((page) => (
                <option key={page.id} value={page.id}>
                  {page.title} ({page.path})
                </option>
              ))}
            </select>
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard title="Blog" description="Where posts live and how many a listing page shows.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Blog path" hint="The public site routes /blog; another value is served by the API but not yet by the site." error={result?.fieldErrors?.blogPath}>
            <input name="blogPath" value={values.blogPath} onChange={(event) => set("blogPath", event.target.value)} disabled={disabled} className={`${formField} font-mono`} />
          </Field>
          <Field label="Posts per page" error={result?.fieldErrors?.postsPerPage}>
            <input name="postsPerPage" type="number" min={1} max={50} value={values.postsPerPage} onChange={(event) => set("postsPerPage", Number(event.target.value) || 10)} disabled={disabled} className={`${formField} tabular-nums`} />
          </Field>
        </div>
      </SettingsCard>

      <SettingsCard title="Footer" description="The line at the bottom of every page, and where the site links out to.">
        <Field label="Footer text" hint="Copyright line, registration numbers — one or two lines.">
          <textarea name="footerText" rows={2} maxLength={500} value={values.footerText ?? ""} onChange={(event) => set("footerText", text(event.target.value))} disabled={disabled} className={formField} />
        </Field>

        <div>
          <p className="mb-1 text-xs font-medium text-muted">Social links</p>
          <div className="space-y-2">
            {values.socialLinks.map((link, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <input
                  aria-label="Label"
                  placeholder="LinkedIn"
                  value={link.label}
                  onChange={(event) => set("socialLinks", values.socialLinks.map((entry, i) => (i === index ? { ...entry, label: event.target.value } : entry)))}
                  disabled={disabled}
                  className={`${formField} max-w-40`}
                />
                <input
                  aria-label="URL"
                  type="url"
                  placeholder="https://"
                  value={link.url}
                  onChange={(event) => set("socialLinks", values.socialLinks.map((entry, i) => (i === index ? { ...entry, url: event.target.value } : entry)))}
                  disabled={disabled}
                  className={`${formField} flex-1`}
                />
                {!disabled ? (
                  <button type="button" onClick={() => set("socialLinks", values.socialLinks.filter((_, i) => i !== index))} className="text-xs text-muted hover:text-fg">
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
            {!disabled ? (
              <button type="button" onClick={() => set("socialLinks", [...values.socialLinks, { label: "", url: "" }])} className="text-xs text-accent-text hover:underline">
                + Add a link
              </button>
            ) : values.socialLinks.length === 0 ? (
              <p className="text-xs text-faint">None.</p>
            ) : null}
          </div>
        </div>
      </SettingsCard>

      <SettingsCard title="Search engines" description="Defaults for pages that do not set their own, and the master switch.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Default meta description" hint={`${(values.defaultMetaDescription ?? "").length} / 155`} span={2}>
            <textarea name="defaultMetaDescription" rows={2} maxLength={320} value={values.defaultMetaDescription ?? ""} onChange={(event) => set("defaultMetaDescription", text(event.target.value))} disabled={disabled} className={formField} />
          </Field>
          <div>
            <span className="mb-1 block text-xs font-medium text-muted">Default social image</span>
            {ogImage ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ogImage.url} alt="" className="h-14 w-24 rounded border border-line object-cover" />
                {!disabled ? (
                  <button
                    type="button"
                    onClick={() => {
                      setOgImage(null);
                      set("defaultOgImageId", null);
                    }}
                    className="text-xs text-muted hover:text-fg"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ) : (
              <button type="button" disabled={disabled} onClick={() => setPickerOpen(true)} className="btn-secondary rounded-lg px-3 py-1.5 text-xs disabled:opacity-50">
                Choose image
              </button>
            )}
          </div>
          <div className="pt-4">
            <Toggle
              name="indexable"
              label="Allow search engines to index the site"
              description="Off, and every page carries noindex and robots.txt disallows crawling — for a site still being built."
              defaultChecked={values.indexable}
              disabled={disabled}
              onChange={(checked) => set("indexable", checked)}
            />
          </div>
        </div>
      </SettingsCard>

      {canManage ? (
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">
            {pending ? "Saving…" : "Save settings"}
          </button>
          <span className="text-xs text-muted">
            {settings.updatedAt
              ? `Last changed ${new Date(settings.updatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}`
              : "Never changed — showing defaults."}
          </span>
        </div>
      ) : (
        <p className="rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
          You can read these settings but not change them. Changing them needs <code className="font-mono">cms.settings.manage</code>.
        </p>
      )}

      <MediaPicker
        open={pickerOpen}
        accept="image"
        onClose={() => setPickerOpen(false)}
        onSelect={(media) => {
          setPickerOpen(false);
          setOgImage({ id: media.id, url: media.url });
          set("defaultOgImageId", media.id);
        }}
      />
    </form>
  );
}
