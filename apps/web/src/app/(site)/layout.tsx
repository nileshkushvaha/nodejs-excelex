import type { ReactNode } from "react";

import { BackToTop } from "@/components/site/back-to-top";
import { menuToFooterColumns, menuToNav } from "@/components/site/cms-menus";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getPublicSite } from "@/lib/api";

/**
 * The public site: everything a customer sees without an account.
 *
 * Separate from the (app) group because it shares nothing with it — no
 * sidebar, no session, no client context. The header is fixed, so the first
 * section of every page owns its own top padding rather than the layout
 * guessing at a number that only suits the hero.
 *
 * The site settings and menus are fetched here, once per request, and handed
 * down. The fetch is allowed to fail: a null answer — the CMS has nothing
 * published, the API is down, the host has no client — leaves the header and
 * footer on the static copy the site shipped with, which is exactly what they
 * rendered before there was a CMS at all.
 */
export default async function SiteLayout({ children }: { children: ReactNode }) {
  const site = await getPublicSite();
  const nav = menuToNav(site?.menus.header);

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-fg">
      <SiteHeader {...(nav ? { nav } : {})} />
      <main className="flex-1">{children}</main>
      <SiteFooter
        content={
          site
            ? {
                title: site.title,
                tagline: site.tagline,
                footerText: site.footerText,
                socialLinks: site.socialLinks,
                columns: menuToFooterColumns(site.menus.footer),
              }
            : null
        }
      />
      <BackToTop />
    </div>
  );
}
