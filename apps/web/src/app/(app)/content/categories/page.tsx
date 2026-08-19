import { TermsManager } from "@/components/cms/terms-manager";
import { getCmsTerms, getCurrentSession } from "@/lib/api";
import { can } from "@/lib/can";

export const metadata = { title: "Categories · ExcelEx" };

export default async function CategoriesPage() {
  const [terms, session] = await Promise.all([getCmsTerms("taxonomy=CATEGORY"), getCurrentSession()]);

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
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Categories</h1>
        <p className="mt-0.5 text-sm text-muted">How posts are grouped on the blog. Categories nest, and each has an archive page listing what it holds.</p>
      </header>

      <TermsManager taxonomy="CATEGORY" terms={terms} canManage={can(session, "cmsTerm", "update")} />
    </div>
  );
}
