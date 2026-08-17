import { getCountries, getCurrentSession, getGeneralSettings, getStates } from "@/lib/api";
import { GeneralForm } from "./general-form";

export const metadata = { title: "General settings · ExcelEx" };

/**
 * Time zones and currencies come from the runtime and from our own country
 * master rather than a hand-kept list — one fewer thing to maintain, and the
 * names track CLDR when a zone or a currency changes.
 */
function timezoneOptions(): string[] {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf;

  const zones = supported ? supported("timeZone") : [];
  // India first: it is the answer for almost every client, and hunting for it
  // in four hundred alphabetical entries is a poor greeting.
  return ["Asia/Kolkata", ...zones.filter((zone) => zone !== "Asia/Kolkata")];
}

export default async function GeneralSettingsPage() {
  const [settings, session, countries] = await Promise.all([
    getGeneralSettings(),
    getCurrentSession(),
    getCountries(),
  ]);

  if (!settings) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">settings.general.view</code>.
      </p>
    );
  }

  const states = (await getStates(settings.countryCode)) ?? [];

  const currencyNames = new Intl.DisplayNames(["en"], { type: "currency" });
  const currencies = [...new Set((countries ?? []).map((c) => c.currency).filter(Boolean))]
    .map((code) => ({ code: code as string, label: `${code} — ${currencyNames.of(code as string)}` }))
    .sort((a, b) => a.code.localeCompare(b.code));

  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">General settings</h1>
        <p className="mt-0.5 text-sm text-muted">
          This account&apos;s identity, registrations and document defaults. Your plan and account
          status are set by ExcelEx and are not editable here.
        </p>
      </header>

      <GeneralForm
        settings={settings}
        countries={countries ?? []}
        states={states}
        timezones={timezoneOptions()}
        currencies={currencies}
        canManage={session?.user.permissions.includes("settings.general.manage") ?? false}
      />
    </div>
  );
}
