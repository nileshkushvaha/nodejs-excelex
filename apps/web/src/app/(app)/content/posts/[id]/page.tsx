import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentEditor } from "@/components/cms/content-editor";
import { loadEditor, viewPermission } from "../editor-data";

export const metadata = { title: "Edit post · ExcelEx" };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadEditor(id);

  if (!data.session) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">{viewPermission}</code>.
      </p>
    );
  }
  // A null here is either "no such post" or "may not see it"; the API
  // answers both the same way on purpose, and so does this route.
  if (!data.content) notFound();

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <p className="text-xs text-muted">
          <Link href="/content/posts" className="hover:text-fg hover:underline">
            ← All posts
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Edit post</h1>
        <p className="mt-0.5 text-sm text-muted">
          Last changed{" "}
          {new Date(data.content.updatedAt).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            dateStyle: "medium",
            timeStyle: "short",
          })}
          {data.content.updatedBy ? ` by ${data.content.updatedBy.fullName}` : ""}.
        </p>
      </header>

      <ContentEditor
        collection="posts"
        content={data.content}
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
