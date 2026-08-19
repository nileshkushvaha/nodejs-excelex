import { getPublicFeed, getPublicOrigin, getPublicSite } from "@/lib/api";

/**
 * RSS 2.0 for the blog, from public/feed.
 *
 * Hand-built rather than through a library: the format is twelve lines of
 * XML and a dependency for it would be the larger surface. Every value is
 * escaped, because a post title with an ampersand is not rare. When the CMS
 * is unreachable the feed is a valid, empty channel — a reader that polls
 * every hour should see "nothing new", not a parse error.
 */
export async function GET(): Promise<Response> {
  const [origin, feed, site] = await Promise.all([getPublicOrigin(), getPublicFeed(), getPublicSite()]);
  const title = feed?.title || site?.title || "ExcelEx";
  const link = `${origin}${feed?.link || "/blog"}`;
  const items = feed?.items ?? [];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(link)}</link>
    <description>${escapeXml(site?.defaultMetaDescription || site?.tagline || `Latest posts from ${title}`)}</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(`${origin}/feed.xml`)}" rel="self" type="application/rss+xml" />
${items
  .map((item) => {
    const url = `${origin}${item.path}`;
    return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      ${item.publishedAt ? `<pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>` : ""}
      ${item.author ? `<dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">${escapeXml(item.author)}</dc:creator>` : ""}
      ${item.excerpt ? `<description>${escapeXml(item.excerpt)}</description>` : ""}
    </item>`;
  })
  .join("\n")}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
