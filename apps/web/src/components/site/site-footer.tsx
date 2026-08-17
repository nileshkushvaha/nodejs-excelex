import Link from "next/link";

import { CONTACT, FOOTER } from "@/content/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface-2">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <span className="flex items-center gap-2 font-semibold text-fg">
              <span className="brand-gradient grid h-8 w-8 place-items-center rounded-lg text-sm font-bold text-white">
                E
              </span>
              <span className="text-lg tracking-tight">ExcelEx</span>
            </span>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
              Courier and logistics operations — booking, manifests, scanning, tracking and billing
              on one network.
            </p>

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
          </div>

          {FOOTER.map((column) => (
            <div key={column.heading}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg">
                {column.heading}
              </h2>
              <ul className="space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
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
          <p>© {new Date().getFullYear()} ExcelEx Express Logistics LLP. All rights reserved.</p>
          <p>{CONTACT.hours}</p>
        </div>
      </div>
    </footer>
  );
}
