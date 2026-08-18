"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { readApiError, type ApiError } from "@/lib/api-error";

/**
 * Three steps on one screen: address, code, new password.
 *
 * Kept as one component with a `step` because the person's context — the
 * address they typed — carries across all three, and because the reset
 * token issued at step two lives only in memory here: it is never put in a
 * URL, so it is never in a browser history or a proxy log.
 *
 * The messages come from the API verbatim. The API is careful to say the
 * same thing whether or not the address exists; embellishing here would
 * undo that.
 */
const input =
  "w-full rounded border border-line-strong px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

type Step = "email" | "code" | "password" | "done";

export function ForgotPasswordFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function call(path: string, body: unknown): Promise<unknown> {
    const response = await fetch(`/api/v1/auth/password-reset/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw await readApiError(response);
    return response.json();
  }

  function fail(failure: unknown) {
    const api = failure as ApiError;
    if (api && typeof api === "object" && "status" in api) {
      setError(api.message);
      setFieldErrors(api.fieldErrors());
    } else {
      setError("We could not reach the server. Try again in a moment.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    setFieldErrors({});
    try {
      if (step === "email") {
        const result = (await call("request", { email })) as { message: string };
        setNotice(result.message);
        setStep("code");
      } else if (step === "code") {
        const result = (await call("verify", { email, code })) as { resetToken: string };
        setResetToken(result.resetToken);
        setStep("password");
      } else if (step === "password") {
        if (password !== confirm) {
          setFieldErrors({ confirm: "The two passwords do not match." });
          return;
        }
        const result = (await call("complete", { email, resetToken, newPassword: password })) as { message: string };
        setNotice(result.message);
        setStep("done");
      }
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const result = (await call("request", { email })) as { message: string };
      setNotice(result.message);
      setCode("");
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy(false);
    }
  }

  if (step === "done") {
    return (
      <div className="space-y-4">
        <p role="status" className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
          {notice}
        </p>
        <button type="button" onClick={() => router.push("/login")} className="btn-primary w-full rounded-lg px-3 py-2.5 text-sm font-medium">
          Go to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {notice ? (
        <p role="status" className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-fg">
          Email address
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          autoFocus={step === "email"}
          readOnly={step !== "email"}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={`${input} ${step !== "email" ? "bg-surface-2 text-muted" : ""}`}
        />
      </div>

      {step === "code" ? (
        <div>
          <label htmlFor="code" className="mb-1 block text-sm font-medium text-fg">
            Six-digit code
          </label>
          <input
            id="code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            autoComplete="one-time-code"
            required
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            className={`${input} font-mono text-lg tracking-[0.4em]`}
          />
          <p className="mt-1 text-xs text-faint">
            Check your inbox — and the spam folder. It expires in 10 minutes.{" "}
            <button type="button" onClick={resend} disabled={busy} className="underline-offset-2 hover:underline">
              Send another
            </button>
          </p>
        </div>
      ) : null}

      {step === "password" ? (
        <>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-fg">
              New password
            </label>
            <input id="password" type="password" autoComplete="new-password" required autoFocus value={password} onChange={(event) => setPassword(event.target.value)} className={input} />
            {fieldErrors["newPassword"] ? <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors["newPassword"]}</p> : null}
          </div>
          <div>
            <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-fg">
              Confirm new password
            </label>
            <input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(event) => setConfirm(event.target.value)} className={input} />
            {fieldErrors["confirm"] ? <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors["confirm"]}</p> : null}
          </div>
          <p className="text-xs text-faint">Every device signed in to this account will be signed out.</p>
        </>
      ) : null}

      <button type="submit" disabled={busy} className="btn-primary w-full rounded-lg px-3 py-2.5 text-sm font-medium disabled:opacity-60">
        {busy ? "Working…" : step === "email" ? "Email me a code" : step === "code" ? "Continue" : "Set new password"}
      </button>
    </form>
  );
}
