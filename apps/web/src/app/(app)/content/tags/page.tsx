import { TermsManager } from "@/components/cms/terms-manager";
import { getCmsTerms, getCurrentSession } from "@/lib/api";
import { can } from "@/lib/can";

export const metadata = { title: "Tags · ExcelEx" };

export default async function TagsPage() {
  const [terms, session] = await Promise.all([getCmsTerms("taxonomy=TAG"), getCurrentSession()]);

  if (!terms) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">cms.post.view</code>.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Tags</h1>
        <p className="mt-0.5 text-sm text-muted">Free-form labels on posts — flat, many per post, each with its own archive page. Merge duplicates rather than deleting them.</p>
      </header>

      <TermsManager taxonomy="TAG" terms={terms} canManage={can(session, "cmsTerm", "update")} />
    </div>
  );
}
