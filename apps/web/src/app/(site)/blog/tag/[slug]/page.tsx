import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BLOG_BASE, BlogListing, parsePageNumber } from "@/components/site/blog";
import { buildMetadata, firstParam } from "@/components/site/cms-page";
import { getPublicTags } from "@/lib/api";

/** A tag archive; same shape as a category, paged by `?page=N`. */
type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

async function load(props: Props) {
  const [{ slug }, query] = await Promise.all([props.params, props.searchParams]);
  const tags = (await getPublicTags()) ?? [];
  const tag = tags.find((entry) => entry.slug === slug) ?? null;
  const page = parsePageNumber(firstParam(query.page) ?? "1");
  return { slug, tag, page };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { tag, slug } = await load(props);
  if (!tag) return {};
  return buildMetadata({ title: `Tagged “${tag.name}”`, path: `${BLOG_BASE}/tag/${slug}` });
}

export default async function BlogTagPage(props: Props) {
  const { tag, slug, page } = await load(props);
  if (!tag || !page) notFound();

  return (
    <BlogListing
      query={new URLSearchParams({ tag: slug })}
      page={page}
      pageBase={`${BLOG_BASE}/tag/${slug}`}
      pageHref={(n) => (n <= 1 ? `${BLOG_BASE}/tag/${slug}` : `${BLOG_BASE}/tag/${slug}?page=${n}`)}
      eyebrow="Tag"
      title={tag.name}
      intro={`${tag.count} ${tag.count === 1 ? "post" : "posts"} tagged “${tag.name}”.`}
    />
  );
}
