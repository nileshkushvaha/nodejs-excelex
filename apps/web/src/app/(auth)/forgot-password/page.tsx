import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/api";
import { ForgotPasswordFlow } from "./forgot-password-flow";

export const metadata = { title: "Reset your password · ExcelEx" };

export default async function ForgotPasswordPage() {
  if (await getCurrentSession()) redirect("/dashboard");

  return (
    <main className="grid min-h-dvh place-items-center bg-surface-2 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="brand-gradient mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl text-lg font-bold text-white shadow-[var(--shadow-brand)]">
            E
          </span>
          <h1 className="text-lg font-semibold text-fg">Reset your password</h1>
          <p className="mt-1 text-sm text-muted">We will email you a six-digit code.</p>
        </div>

        <div className="card rounded-xl p-6 shadow-sm">
          <ForgotPasswordFlow />
        </div>

        <p className="mt-4 text-center text-xs text-faint">
          <Link href="/login" className="underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
