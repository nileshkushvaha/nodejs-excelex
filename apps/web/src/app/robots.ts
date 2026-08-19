import type { MetadataRoute } from "next";

import { getPublicOrigin, getPublicSite } from "@/lib/api";

/**
 * robots.txt, decided by the site setting.
 *
 * `indexable` off is the whole-site switch an administrator flips while a
 * site is being built out; it disallows everything. On, or when the CMS
 * cannot say, crawlers get the public site and are kept out of the signed-in
 * application and the API — neither has anything a search engine should hold.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const [origin, site] = await Promise.all([getPublicOrigin(), getPublicSite()]);

  if (site && site.indexable === false) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The signed-in application's route groups. "/network/" with the
        // slash: the public site's own /network page stays crawlable, its
        // application sub-routes (/network/pincodes…) do not.
        disallow: [
          "/api/",
          "/login",
          "/forgot-password",
          "/accounts",
          "/branches",
          "/consignees",
          "/content",
          "/customers",
          "/dashboard",
          "/geography",
          "/lookups",
          "/network/",
          "/notifications",
          "/organisation",
          "/products",
          "/profile",
          "/rates",
          "/roles",
          "/settings",
          "/shippers",
          "/system",
          "/users",
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
