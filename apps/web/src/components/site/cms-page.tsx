import type { Metadata } from "next";
import Link from "next/link";
import { permanentRedirect, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { PageHeader } from "./page-header";

import {
  getPublicOrigin,
  getPublicPage,
  getPublicSite,
  type PublicPage,
  type PublicRedirect,
  type PublicSeo,
  type PublicSite,
} from "@/lib/api";

/**
 * A CMS page on the public site.
 *
 * Three templates, chosen by the editor: `default` opens with the same banner
 * every static page uses and sets the body in a reading column; `landing`
 * opens with the featured image as a full-bleed hero and lets the body run
 * wider; `full-width` has no banner at all — the body is the whole page, for
 * an editor who has built the layout in the content itself. Anything else the
 * API sends is treated as `default`, so a template added later degrades to a
 * readable page rather than a blank one.
 *
 * The body is HTML sanitised by the API before it was stored, which is the
 * only reason it is set with dangerouslySetInnerHTML here. The web app does
 * not sanitise again: two sanitisers with different opinions is how a tag
 * that one allows and the other strips becomes a support ticket.
 */
export function CmsPageView({ page, preview = false }: { page: PublicPage; preview?: boolean }) {
  const template = page.template === "landing" || page.template === "full-width" ? page.template : "default";

  return (
    <>
      {preview ? <PreviewBanner /> : null}

      {template === "default" ? (
        <>
          <PageHeader
            eyebrow={page.breadcrumbs.at(-2)?.title ?? "ExcelEx"}
            title={page.title}
            {...(page.excerpt ? { intro: page.excerpt } : {})}
          />
          <article className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <Breadcrumbs page={page} />
            {page.featuredImage ? (
              <figure className="mb-10 overflow-hidden rounded-2xl border border-line">
                <CmsImage image={page.featuredImage} className="h-auto w-full" />
              </figure>
            ) : null}
            <ProseBody html={page.body} className="max-w-3xl" />
            <ChildPages page={page} />
          </article>
        </>
      ) : null}

      {template === "landing" ? (
        <>
          <section className="relative isolate overflow-hidden border-b border-line">
            {page.featuredImage ? (
              <CmsImage
                image={page.featuredImage}
                className="absolute inset-0 -z-20 h-full w-full object-cover"
              />
            ) : null}
            <div aria-hidden className={page.featuredImage ? "absolute inset-0 -z-10 bg-canvas/70" : "aurora -z-30 opacity-70"} />
            <div aria-hidden className="grain -z-10" />
            <div className="animate-fade-up mx-auto max-w-6xl px-5 pb-24 pt-40 sm:pt-48">
              <h1 className="headline-gradient max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-[3.5rem]">
                {page.title}
              </h1>
              {page.excerpt ? (
                <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">{page.excerpt}</p>
              ) : null}
            </div>
          </section>
          <article className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
            <ProseBody html={page.body} className="max-w-4xl" />
            <ChildPages page={page} />
          </article>
        </>
      ) : null}

      {template === "full-width" ? (
        <article className="pt-16">
          <ProseBody html={page.body} className="mx-auto max-w-6xl px-5 py-16 sm:py-20" />
        </article>
      ) : null}
    </>
  );
}

/** The sanitised HTML, in the site's prose styles (globals.css `.prose-cms`). */
export function ProseBody({ html, className = "" }: { html: string; className?: string }) {
  return <div className={`prose-cms ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function CmsImage({
  image,
  className,
}: {
  image: { url: string; alt: string | null; width?: number | null; height?: number | null };
  className?: string;
}) {
  // A plain <img>: media URLs are served by the API from whatever storage the
  // client uses, and next/image would need every one of those hosts allowed
  // in next.config ahead of time.
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={image.url}
      alt={image.alt ?? ""}
      {...(image.width ? { width: image.width } : {})}
      {...(image.height ? { height: image.height } : {})}
      loading="lazy"
      className={className}
    />
  );
}

function Breadcrumbs({ page }: { page: PublicPage }) {
  if (page.breadcrumbs.length < 2) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-8 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link href="/" className="hover:text-fg">
            Home
          </Link>
        </li>
        {page.breadcrumbs.map((crumb, index) => {
          const last = index === page.breadcrumbs.length - 1;
          return (
            <li key={crumb.path} className="flex items-center gap-1.5">
              <span aria-hidden>/</span>
              {last ? (
                <span aria-current="page" className="text-fg">
                  {crumb.title}
                </span>
              ) : (
                <Link href={crumb.path} className="hover:text-fg">
                  {crumb.title}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ChildPages({ page }: { page: PublicPage }) {
  if (!page.children.length) return null;
  return (
    <nav aria-label="In this section" className="mt-14 border-t border-line pt-8">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-accent-text">In this section</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {page.children.map((child) => (
          <li key={child.path}>
            <Link href={child.path} className="glass glass-lift block rounded-xl px-4 py-3 text-sm font-medium text-fg">
              {child.title} <span aria-hidden>→</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Shown when the page was fetched with a preview token: the editor is looking
 * at something nobody else can see yet, and the banner says so before they
 * copy the address to a colleague.
 */
export function PreviewBanner({ children }: { children?: ReactNode }) {
  return (
    <div className="fixed inset-x-0 top-16 z-40 border-b border-amber-300/60 bg-amber-100/90 px-5 py-2 text-center text-xs font-medium text-amber-900 backdrop-blur dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200">
      Preview — not published. {children ?? "This is how the page will look; visitors cannot see it yet."}
    </div>
  );
}

/**
 * The static pages call this first: if an editor has published a CMS page at
 * the same path — `/about`, `/services` — the CMS page wins, because it is
 * the one somebody chose to write. Null means "render your static self", and
 * covers every way the CMS can be absent: nothing published there, the API
 * down, the host having no client.
 *
 * A redirect at the path is followed here as well, so an editor who moves
 * a page over a static route sees the move honoured.
 */
export async function renderCmsPageOrNull(path: string, preview?: string | null): Promise<ReactNode | null> {
  const result = await getPublicPage(path, preview);
  if (!result) return null;
  if (isRedirect(result)) followRedirect(result);
  return <CmsPageView page={result} preview={Boolean(preview)} />;
}

export function isRedirect(result: PublicPage | PublicRedirect): result is PublicRedirect {
  return "redirect" in result && Boolean(result.redirect?.to);
}

/** Never returns: Next's redirect throws to hand control back to the router. */
export function followRedirect(result: PublicRedirect): never {
  if (result.redirect.statusCode === 301 || result.redirect.statusCode === 308) {
    permanentRedirect(result.redirect.to);
  }
  redirect(result.redirect.to);
}

/** The first string value of a `searchParams` entry, or undefined. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * <head> metadata from an item's SEO fields, with the site's defaults behind
 * them. Robots is the one field that is not a fallback but a union: the page
 * is kept out of the index if the editor asked for that on the page, or the
 * administrator asked for it on the whole site.
 */
export async function buildMetadata(input: {
  title: string;
  path: string;
  seo?: PublicSeo | null;
  excerpt?: string | null;
  image?: { url: string } | null;
  type?: "website" | "article";
  publishedAt?: string | null;
  updatedAt?: string | null;
  site?: PublicSite | null;
}): Promise<Metadata> {
  const [site, origin] = await Promise.all([input.site === undefined ? getPublicSite() : input.site, getPublicOrigin()]);
  const siteTitle = site?.title || "ExcelEx";
  const title = input.seo?.title || `${input.title} · ${siteTitle}`;
  const description = input.seo?.description || input.excerpt || site?.defaultMetaDescription || undefined;
  const canonical = input.seo?.canonical || `${origin}${input.path}`;
  const image = input.seo?.ogImageUrl || input.image?.url || site?.defaultOgImageUrl || undefined;
  const noIndex = Boolean(input.seo?.noIndex) || site?.indexable === false;

  return {
    title,
    ...(description ? { description } : {}),
    alternates: { canonical },
    openGraph: {
      title,
      ...(description ? { description } : {}),
      url: canonical,
      siteName: siteTitle,
      type: input.type ?? "website",
      ...(image ? { images: [{ url: absolute(image, origin) }] } : {}),
      ...(input.type === "article" && input.publishedAt ? { publishedTime: input.publishedAt } : {}),
      ...(input.type === "article" && input.updatedAt ? { modifiedTime: input.updatedAt } : {}),
    },
    twitter: { card: image ? "summary_large_image" : "summary", title, ...(description ? { description } : {}) },
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
  };
}

export function absolute(url: string, origin: string): string {
  return /^https?:\/\//i.test(url) ? url : `${origin}${url.startsWith("/") ? "" : "/"}${url}`;
}
