import type { Metadata } from "next";

import { BLOG_BASE, BlogListing } from "@/components/site/blog";
import { buildMetadata } from "@/components/site/cms-page";

/** The blog index: page one of everything published, newest first. */
export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ title: "Blog", path: BLOG_BASE });
}

export default function BlogIndexPage() {
  return (
    <BlogListing
      query={new URLSearchParams()}
      page={1}
      pageBase={BLOG_BASE}
      eyebrow="Blog"
      title="News and notes from the network."
      intro="What is changing, what we have learned, and what it means for the people who ship with us."
    />
  );
}
