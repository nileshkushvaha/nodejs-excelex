import type { ReactNode } from "react";

import { BackToTop } from "@/components/site/back-to-top";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

/**
 * The public site: everything a customer sees without an account.
 *
 * Separate from the (app) group because it shares nothing with it — no
 * sidebar, no session, no client context. The header is fixed, so the first
 * section of every page owns its own top padding rather than the layout
 * guessing at a number that only suits the hero.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-fg">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <BackToTop />
    </div>
  );
}
