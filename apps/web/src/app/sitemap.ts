import type { MetadataRoute } from "next";

import { getPublicOrigin, getPublicSite, getPublicSitemap } from "@/lib/api";

/**
 * The sitemap: the site's own routes, then everything the CMS has published.
 *
 * Built per request against the visitor's host, because every client's site
 * is its own host and a sitemap that named the wrong one would be worse than
 * none. When the CMS is unreachable the static routes are still listed — the
 * marketing pages exist whether or not the CMS does. A site marked not
 * indexable still gets a sitemap file (robots.txt is what says "do not"), so
 * an administrator can check what would be indexed before switching it on.
 */
const STATIC_ROUTES = ["/", "/services", "/network", "/about", "/contact", "/track", "/blog"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [origin, cms, site] = await Promise.all([getPublicOrigin(), getPublicSitemap(), getPublicSite()]);
  const homeSlug = site?.homePage?.slug ? `/${site.homePage.slug}` : null;

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${origin}${path}`,
    changeFrequency: path === "/blog" ? "daily" : "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));

  const seen = new Set(STATIC_ROUTES);
  for (const url of cms?.urls ?? []) {
    // The page that is served at "/" is already listed as "/".
    if (!url.path || seen.has(url.path) || url.path === homeSlug) continue;
    seen.add(url.path);
    entries.push({
      url: `${origin}${url.path}`,
      lastModified: url.updatedAt ? new Date(url.updatedAt) : undefined,
      changeFrequency: url.kind === "post" ? "weekly" : "monthly",
      priority: url.kind === "page" ? 0.7 : 0.5,
    });
  }

  return entries;
}
