import { getCmsContents, getCmsSettings, getCurrentSession } from "@/lib/api";
import { can } from "@/lib/can";
import { SiteSettingsForm } from "./settings-form";

export const metadata = { title: "Site settings · ExcelEx" };

export default async function SiteSettingsPage() {
  const [settings, session, pages] = await Promise.all([
    getCmsSettings(),
    getCurrentSession(),
    getCmsContents("pages", "status=PUBLISHED&pageSize=100&sort=title"),
  ]);

  if (!settings) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">cms.page.view</code>.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Site settings</h1>
        <p className="mt-0.5 text-sm text-muted">
          What the public site calls itself, which page is its front door, how the blog is laid out, and
          the search defaults every page inherits.
        </p>
      </header>

      <SiteSettingsForm
        settings={settings}
        pages={(pages?.rows ?? []).map((row) => ({ id: row.id, title: row.title, path: row.path }))}
        canManage={can(session, "cmsSettings", "update")}
      />
    </div>
  );
}
