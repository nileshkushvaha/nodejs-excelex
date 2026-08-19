import Link from "next/link";

import { ContentEditor } from "@/components/cms/content-editor";
import { loadEditor } from "../editor-data";

export const metadata = { title: "New post · ExcelEx" };

export default async function NewPostPage() {
  const data = await loadEditor(null);

  if (!data.session || !data.canManage) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">cms.post.manage</code>.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <p className="text-xs text-muted">
          <Link href="/content/posts" className="hover:text-fg hover:underline">
            ← All posts
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">New post</h1>
        <p className="mt-0.5 text-sm text-muted">Saved as a draft the first time you save; nothing is public until it is published.</p>
      </header>

      <ContentEditor
        collection="posts"
        content={null}
        categories={data.categories}
        parents={data.parents}
        blogPath={data.blogPath}
        siteTitle={data.siteTitle}
        authorName={data.session.user.fullName}
        canManage={data.canManage}
        canPublish={data.canPublish}
        canCreateTerms={data.canCreateTerms}
      />
    </div>
  );
}
