import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BLOG_BASE, BlogListing, findCategory, parsePageNumber } from "@/components/site/blog";
import { buildMetadata, firstParam } from "@/components/site/cms-page";
import { getPublicCategories } from "@/lib/api";

/**
 * A category archive. Paging is `?page=N` here rather than a nested route:
 * the category tree can be as deep as the editor made it, and a `/page/N`
 * segment under a `[slug]` would collide with a category slugged "page".
 *
 * The category is looked up in the public tree so the banner can carry its
 * name and description; an unknown slug is a 404 rather than an empty list
 * headed by a slug.
 */
type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

async function load(props: Props) {
  const [{ slug }, query] = await Promise.all([props.params, props.searchParams]);
  const categories = (await getPublicCategories()) ?? [];
  const category = findCategory(categories, slug);
  const page = parsePageNumber(firstParam(query.page) ?? "1");
  return { slug, category, page };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { category, slug } = await load(props);
  if (!category) return {};
  return buildMetadata({
    title: category.name,
    path: `${BLOG_BASE}/category/${slug}`,
    excerpt: category.description,
  });
}

export default async function BlogCategoryPage(props: Props) {
  const { category, slug, page } = await load(props);
  if (!category || !page) notFound();

  return (
    <BlogListing
      query={new URLSearchParams({ category: slug })}
      page={page}
      pageBase={`${BLOG_BASE}/category/${slug}`}
      pageHref={(n) => (n <= 1 ? `${BLOG_BASE}/category/${slug}` : `${BLOG_BASE}/category/${slug}?page=${n}`)}
      eyebrow="Category"
      title={category.name}
      {...(category.description ? { intro: category.description } : {})}
    />
  );
}
