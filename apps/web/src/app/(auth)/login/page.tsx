import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/api";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · ExcelEx" };

export default async function LoginPage() {
  // Already signed in: send them on rather than presenting a form that would
  // rotate a perfectly good session.
  if (await getCurrentSession()) redirect("/dashboard");

  return (
    <main className="grid min-h-dvh place-items-center bg-surface-2 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="brand-gradient mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl text-lg font-bold text-white shadow-[var(--shadow-brand)]">
            E
          </span>
          <h1 className="text-lg font-semibold text-fg">Sign in to ExcelEx</h1>
          <p className="mt-1 text-sm text-muted">Courier operations</p>
        </div>

        <div className="card rounded-xl p-6 shadow-sm">
          <LoginForm />
        </div>

        <p className="mt-4 text-center text-xs text-faint">
          Accounts are created by invitation. There is no self-service signup.
        </p>
        <p className="mt-1 text-center text-xs">
          <Link href="/" className="text-muted underline hover:text-fg">
            Back to the public site
          </Link>
        </p>
      </div>
    </main>
  );
}
