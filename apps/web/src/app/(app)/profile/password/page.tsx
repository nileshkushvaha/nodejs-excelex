import Link from "next/link";

import { getPasswordPolicy } from "@/lib/api";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Change password · ExcelEx" };

export default async function ChangePasswordPage() {
  const policy = await getPasswordPolicy();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/profile" className="text-xs text-muted hover:underline">
        ← My profile
      </Link>

      <header className="mb-5 mt-2">
        <h1 className="text-xl font-semibold text-fg">Change password</h1>
        <p className="mt-0.5 text-sm text-muted">
          The rules below come from this account&apos;s password policy.
        </p>
      </header>

      <PasswordForm policy={policy} />
    </div>
  );
}
