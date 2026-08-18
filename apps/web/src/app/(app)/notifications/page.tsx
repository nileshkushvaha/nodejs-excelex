import { getNotifications } from "@/lib/api";
import { NotificationsList } from "./notifications-list";

export const metadata = { title: "Notifications · ExcelEx" };

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["page", "pageSize", "unread", "kind"]) {
    const value = params[key];
    const single = Array.isArray(value) ? value[0] : value;
    if (single) query.set(key, single);
  }
  const page = await getNotifications(query.toString());

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Notifications</h1>
        <p className="mt-0.5 text-sm text-muted">
          Things you should know about: locked accounts, failed jobs, undelivered mail. Yours only —
          each person sees their own.
        </p>
      </header>
      <NotificationsList page={page} />
    </div>
  );
}
