import Link from "next/link";

import { ArcArt } from "./artwork";

import { CONTACT, FOOTER, type FooterColumn } from "@/content/site";

/**
 * What the footer can be told by the CMS. Everything is optional and every
 * gap is filled from the static copy in src/content/site.ts, so a client that
 * has published nothing gets the same footer the site shipped with, and a
 * client that has set only a title gets that title over the static columns.
 */
export interface SiteFooterContent {
  title?: string | null;
  tagline?: string | null;
  footerText?: string | null;
  socialLinks?: Array<{ label: string; url: string }> | null;
  columns?: readonly FooterColumn[] | null;
}

export function SiteFooter({ content }: { content?: SiteFooterContent | null }) {
  const title = content?.title || "ExcelEx";
  const tagline =
    content?.tagline ||
    "Courier and logistics operations — booking, manifests, scanning, tracking and billing on one network.";
  const columns = content?.columns?.length ? content.columns : FOOTER;
  const social = content?.socialLinks?.filter((link) => link.label && link.url) ?? [];

  return (
    <footer className="relative isolate overflow-hidden border-t border-line bg-surface/40">
      <div aria-hidden className="aurora -z-20 opacity-40" />
      <div aria-hidden className="grain -z-10" />
      <ArcArt className="pointer-events-none absolute -left-40 top-10 -z-10 h-[26rem] w-[26rem] rotate-180 opacity-40" />

      <div className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <span className="flex items-center gap-2 font-semibold text-fg">
              <span className="brand-gradient grid h-8 w-8 place-items-center rounded-lg text-sm font-bold text-white">
                {title.charAt(0).toUpperCase()}
              </span>
              <span className="text-lg tracking-tight">{title}</span>
            </span>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">{tagline}</p>

            <address className="mt-5 not-italic text-sm text-muted">
              {CONTACT.addressLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
              <a href={`tel:${CONTACT.phone.replace(/\s/g, "")}`} className="mt-2 block hover:text-fg">
                {CONTACT.phone}
              </a>
              <a href={`mailto:${CONTACT.email}`} className="block hover:text-fg">
                {CONTACT.email}
              </a>
            </address>

            {social.length ? (
              <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2">
                {social.map((link) => (
                  <li key={`${link.label}:${link.url}`}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted transition-colors hover:text-fg"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {columns.map((column) => (
            <div key={column.heading}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg">
                {column.heading}
              </h2>
              <ul className="space-y-2">
                {column.links.map((link) => (
                  <li key={`${link.label}:${link.href}`}>
                    <Link href={link.href} className="text-sm text-muted transition-colors hover:text-fg">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          {/* Rendered on the server on every request, so it cannot go stale the
              way a build-time year would. */}
          <p>
            {content?.footerText || `© ${new Date().getFullYear()} ExcelEx Express Logistics LLP. All rights reserved.`}
          </p>
          <p>{CONTACT.hours}</p>
        </div>
      </div>
    </footer>
  );
}
