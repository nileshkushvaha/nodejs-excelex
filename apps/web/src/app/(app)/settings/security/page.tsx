import { getCurrentSession, getPasswordPolicy } from "@/lib/api";
import { PasswordPolicyForm } from "./password-policy-form";

export const metadata = { title: "Password policy · ExcelEx" };

export default async function SecuritySettingsPage() {
  const [policy, session] = await Promise.all([getPasswordPolicy(), getCurrentSession()]);

  if (!policy) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        The password policy could not be loaded.
      </p>
    );
  }

  const canManage = session?.user.permissions.includes("settings.security.manage") ?? false;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900">Password policy</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Applies to everyone in this account when they set or change a password.
        </p>
      </header>

      <PasswordPolicyForm policy={policy} canManage={canManage} />
    </div>
  );
}
