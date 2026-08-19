import type { FooterColumn, NavItem } from "@/content/site";
import type { PublicMenuItem } from "@/lib/api";

/**
 * CMS menus → the shapes the header and footer already render.
 *
 * The header and footer were written against the static NAV and FOOTER, and
 * they stay that way: rather than teach two components a second data shape,
 * the CMS tree is folded into the first one here. That keeps the fallback
 * honest too — when the CMS has no menu, the components receive exactly what
 * they always did, and nothing about their rendering path changes.
 *
 * The header menu is one level deep (a top item and its dropdown), which is
 * as deep as the design goes; anything nested further is flattened into the
 * dropdown rather than dropped, so an editor's link is never silently lost.
 */
export function menuToNav(items: PublicMenuItem[] | null | undefined): NavItem[] | null {
  if (!items?.length) return null;
  return items
    .filter((item) => item.label && item.url)
    .map((item) => {
      const children = flatten(item.children).map((child) => ({
        label: child.label,
        href: child.url,
        description: child.description ?? "",
      }));
      return children.length
        ? { label: item.label, href: item.url, children }
        : { label: item.label, href: item.url };
    });
}

/**
 * The footer menu is columns: a top item with children is a column headed by
 * its label; loose top-level links are gathered into one final column so an
 * editor who added a flat list still sees every link.
 */
export function menuToFooterColumns(items: PublicMenuItem[] | null | undefined): FooterColumn[] | null {
  if (!items?.length) return null;
  const columns: FooterColumn[] = [];
  const loose: FooterColumn["links"] = [];

  for (const item of items) {
    if (!item.label) continue;
    if (item.children?.length) {
      columns.push({
        heading: item.label,
        links: flatten(item.children)
          .filter((child) => child.url)
          .map((child) => ({ label: child.label, href: child.url })),
      });
    } else if (item.url) {
      loose.push({ label: item.label, href: item.url });
    }
  }

  if (loose.length) columns.push({ heading: columns.length ? "More" : "Links", links: loose });
  return columns.length ? columns : null;
}

function flatten(items: PublicMenuItem[] | null | undefined): PublicMenuItem[] {
  if (!items?.length) return [];
  return items.flatMap((item) => [item, ...flatten(item.children)]);
}
