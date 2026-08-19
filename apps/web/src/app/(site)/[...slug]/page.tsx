import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  buildMetadata,
  CmsPageView,
  firstParam,
  followRedirect,
  isRedirect,
} from "@/components/site/cms-page";
import { getPublicPage } from "@/lib/api";

/**
 * Every CMS page that is not one of the site's own routes.
 *
 * Next resolves a static route before a catch-all, so `/services` and friends
 * never arrive here — they check the CMS themselves (renderCmsPageOrNull).
 * What does arrive is any path an editor invented: `/pricing`,
 * `/help/returns`, nested as deep as the page tree goes. A moved page comes
 * back from the API as a redirect and is followed with the status the editor's
 * move recorded; anything the API does not know is the site's 404, which
 * keeps the header and footer so the visitor is one click from somewhere real.
 */
type Props = {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

async function load(props: Props) {
  const [{ slug }, query] = await Promise.all([props.params, props.searchParams]);
  const path = `/${slug.join("/")}`;
  const preview = firstParam(query.preview);
  const result = await getPublicPage(path, preview);
  return { path, preview, result };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { result, path } = await load(props);
  if (!result || isRedirect(result)) return {};
  return buildMetadata({
    title: result.title,
    path,
    seo: result.seo,
    excerpt: result.excerpt,
    image: result.featuredImage,
  });
}

export default async function CmsCatchAllPage(props: Props) {
  const { result, preview } = await load(props);
  if (!result) notFound();
  if (isRedirect(result)) followRedirect(result);
  return <CmsPageView page={result} preview={Boolean(preview)} />;
}
