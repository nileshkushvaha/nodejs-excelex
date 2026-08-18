import { getCurrentSession, getMailMessages, getMailSettings } from "@/lib/api";
import { can } from "@/lib/can";
import { MailSettingsForm } from "./mail-settings-form";
import { OutboxTable } from "./outbox-table";

export const metadata = { title: "Email · ExcelEx" };

export default async function MailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["page", "pageSize", "status", "search"]) {
    const value = params[key];
    const single = Array.isArray(value) ? value[0] : value;
    if (single) query.set(key, single);
  }

  const [settings, messages, session] = await Promise.all([
    getMailSettings(),
    getMailMessages(query.toString()),
    getCurrentSession(),
  ]);

  if (!settings) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">settings.mail.view</code>.
      </p>
    );
  }

  return (
    <div className="animate-fade-up space-y-8">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Email</h1>
        <p className="mt-0.5 text-sm text-muted">
          How this account sends email — password resets, notices, and later, customer messages —
          and what it has sent.
        </p>
      </header>

      <MailSettingsForm settings={settings} canManage={can(session, "mailSettings", "update")} />

      <section>
        <h2 className="text-lg font-semibold tracking-tight text-fg">Outbox</h2>
        <p className="mt-0.5 mb-3 text-sm text-muted">
          Every message this account asked to send, newest first. Bodies are not stored.
        </p>
        <OutboxTable page={messages} />
      </section>
    </div>
  );
}
