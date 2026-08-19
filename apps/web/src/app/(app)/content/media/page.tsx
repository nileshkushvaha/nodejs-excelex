import { getCmsMedia, getCmsMediaFolders, getCurrentSession } from "@/lib/api";
import { can } from "@/lib/can";
import { MediaManager } from "./media-manager";

export const metadata = { title: "Media · ExcelEx" };

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const query = new URLSearchParams();
  for (const key of ["page", "pageSize", "search", "mimeType", "folder"]) {
    const value = single(key);
    if (value) query.set(key, value);
  }
  if (!query.has("pageSize")) query.set("pageSize", "40");

  const [page, folders, session] = await Promise.all([
    getCmsMedia(query.toString()),
    getCmsMediaFolders(),
    getCurrentSession(),
  ]);

  if (!page) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">cms.media.view</code>.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Media</h1>
        <p className="mt-0.5 text-sm text-muted">
          Every image, document and video the site can show. Upload here, then place from the editor.
        </p>
      </header>

      <MediaManager
        page={page}
        folders={folders ?? []}
        canManage={can(session, "cmsMedia", "update")}
        view={single("view") === "list" ? "list" : "grid"}
      />
    </div>
  );
}
