import { getCurrentSession, getSecuritySettings } from "@/lib/api";
import { LoginSecurityForm } from "./login-security-form";

export const metadata = { title: "Login security · ExcelEx" };

export default async function LoginSecurityPage() {
  const [settings, session] = await Promise.all([getSecuritySettings(), getCurrentSession()]);

  if (!settings) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        You do not hold <code className="font-mono">settings.security.view</code>.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900">Login security</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Protection against brute-force and credential-stuffing attempts.
        </p>
      </header>

      <LoginSecurityForm
        settings={settings}
        canManage={session?.user.permissions.includes("settings.security.manage") ?? false}
      />
    </div>
  );
}
