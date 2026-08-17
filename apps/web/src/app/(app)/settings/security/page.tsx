import { getCurrentSession, getPasswordPolicy } from "@/lib/api";
import { PasswordPolicyForm } from "./password-policy-form";

export const metadata = { title: "Password policy · ExcelEx" };

export default async function SecuritySettingsPage() {
  const [policy, session] = await Promise.all([getPasswordPolicy(), getCurrentSession()]);

  if (!policy) {
    return (
      <p className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50 p-4 text-sm text-amber-800 dark:text-amber-300">
        The password policy could not be loaded.
      </p>
    );
  }

  const canManage = session?.user.permissions.includes("settings.security.manage") ?? false;

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Password policy</h1>
        <p className="mt-0.5 text-sm text-muted">
          Applies to everyone in this account when they set or change a password.
        </p>
      </header>

      <PasswordPolicyForm policy={policy} canManage={canManage} />
    </div>
  );
}
