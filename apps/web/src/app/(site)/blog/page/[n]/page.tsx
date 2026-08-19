import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { BLOG_BASE, BlogListing, parsePageNumber } from "@/components/site/blog";
import { buildMetadata } from "@/components/site/cms-page";

/**
 * Page N of the blog index. Page 1 lives at /blog and only there — a second
 * address for the same list is two entries in the index for one page.
 */
type Props = { params: Promise<{ n: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { n } = await props.params;
  const page = parsePageNumber(n);
  if (!page) return {};
  return buildMetadata({ title: `Blog — page ${page}`, path: `${BLOG_BASE}/page/${page}` });
}

export default async function BlogPagedPage(props: Props) {
  const { n } = await props.params;
  const page = parsePageNumber(n);
  if (!page) notFound();
  if (page === 1) permanentRedirect(BLOG_BASE);

  return (
    <BlogListing
      query={new URLSearchParams()}
      page={page}
      pageBase={BLOG_BASE}
      eyebrow="Blog"
      title="News and notes from the network."
      intro={`Page ${page}.`}
    />
  );
}
