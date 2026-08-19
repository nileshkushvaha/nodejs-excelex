import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BLOG_BASE, formatDate, PostMeta, ShareLinks } from "@/components/site/blog";
import {
  absolute,
  buildMetadata,
  CmsImage,
  firstParam,
  PreviewBanner,
  ProseBody,
} from "@/components/site/cms-page";
import { getPublicOrigin, getPublicPost, getPublicSite } from "@/lib/api";

/**
 * One post.
 *
 * Hero, meta, body, then the things that keep a reader on the site: the
 * previous and next posts, the tags, and share links. The Article JSON-LD is
 * the one piece of structure search engines actually read from a blog, and it
 * is built from the same fields the page shows so the two cannot disagree.
 *
 * `/blog/page`, `/blog/category` and `/blog/tag` are static segments and win
 * over this route, so a post slugged exactly "page", "category" or "tag" is
 * unreachable here — a limitation worth knowing, not worth a workaround.
 */
type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

async function load(props: Props) {
  const [{ slug }, query] = await Promise.all([props.params, props.searchParams]);
  const preview = firstParam(query.preview);
  const post = await getPublicPost(slug, preview);
  return { slug, preview, post };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { post } = await load(props);
  if (!post) return {};
  return buildMetadata({
    title: post.title,
    path: post.path,
    seo: post.seo,
    excerpt: post.excerpt,
    image: post.featuredImage,
    type: "article",
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
  });
}

export default async function BlogPostPage(props: Props) {
  const { post, preview } = await load(props);
  if (!post) notFound();

  const [site, origin] = await Promise.all([getPublicSite(), getPublicOrigin()]);
  const url = `${origin}${post.path}`;
  const image = post.seo.ogImageUrl || post.featuredImage?.url || site?.defaultOgImageUrl || null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    ...(post.excerpt ? { description: post.excerpt } : {}),
    ...(image ? { image: [absolute(image, origin)] } : {}),
    ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
    dateModified: post.updatedAt,
    ...(post.author ? { author: { "@type": "Person", name: post.author.fullName } } : {}),
    publisher: { "@type": "Organization", name: site?.title || "ExcelEx" },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    ...(post.tags.length ? { keywords: post.tags.map((tag) => tag.name).join(", ") } : {}),
    ...(post.categories.length ? { articleSection: post.categories.map((category) => category.name).join(", ") } : {}),
  };

  return (
    <>
      {preview ? <PreviewBanner /> : null}

      <section className="relative isolate overflow-hidden border-b border-line">
        <div aria-hidden className="aurora -z-30 opacity-70" />
        <div aria-hidden className="grid-field -z-20" />
        <div aria-hidden className="grain -z-10" />
        <div className="animate-fade-up mx-auto max-w-6xl px-5 pb-16 pt-36 sm:pt-40">
          <nav aria-label="Breadcrumb" className="mb-5 text-sm text-muted">
            <Link href={BLOG_BASE} className="hover:text-fg">
              Blog
            </Link>
            {post.categories[0] ? (
              <>
                <span aria-hidden className="mx-1.5">/</span>
                <Link href={`${BLOG_BASE}/category/${post.categories[0].slug}`} className="hover:text-fg">
                  {post.categories[0].name}
                </Link>
              </>
            ) : null}
          </nav>
          <h1 className="headline-gradient max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-[3.25rem]">
            {post.title}
          </h1>
          {post.excerpt ? (
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">{post.excerpt}</p>
          ) : null}
          <PostMeta post={post} className="mt-6 !text-sm" />
        </div>
      </section>

      <article className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl">
          {post.featuredImage ? (
            <figure className="mb-10 overflow-hidden rounded-2xl border border-line">
              <CmsImage image={post.featuredImage} className="h-auto w-full" />
              {post.featuredImage.alt ? (
                <figcaption className="px-4 py-2 text-xs text-faint">{post.featuredImage.alt}</figcaption>
              ) : null}
            </figure>
          ) : null}

          <ProseBody html={post.body} />

          <footer className="mt-12 space-y-8 border-t border-line pt-8">
            {post.tags.length ? (
              <ul className="flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <li key={tag.slug}>
                    <Link
                      href={`${BLOG_BASE}/tag/${tag.slug}`}
                      className="rounded-full border border-line px-3 py-1 text-sm text-muted hover:border-line-strong hover:text-fg"
                    >
                      #{tag.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}

            <ShareLinks url={url} title={post.title} />

            {post.publishedAt ? (
              <p className="text-xs text-faint">
                Published {formatDate(post.publishedAt)}
                {post.updatedAt && post.updatedAt !== post.publishedAt ? ` · Updated ${formatDate(post.updatedAt)}` : ""}
              </p>
            ) : null}
          </footer>

          {post.previous || post.next ? (
            <nav aria-label="More posts" className="mt-10 grid gap-4 sm:grid-cols-2">
              {post.previous ? (
                <Link href={post.previous.path} className="glass glass-lift rounded-2xl p-5" rel="prev">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-faint">← Previous</span>
                  <span className="mt-1 block font-medium text-fg">{post.previous.title}</span>
                </Link>
              ) : (
                <span />
              )}
              {post.next ? (
                <Link href={post.next.path} className="glass glass-lift rounded-2xl p-5 text-right" rel="next">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-faint">Next →</span>
                  <span className="mt-1 block font-medium text-fg">{post.next.title}</span>
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      </article>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </>
  );
}
