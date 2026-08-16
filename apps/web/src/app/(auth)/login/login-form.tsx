"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
        const message = Array.isArray(body?.message) ? body.message[0] : body?.message;
        // The server's message is deliberately identical for an unknown address
        // and a wrong password. Do not embellish it here — a friendlier,
        // more specific message would turn this form into an account oracle.
        setError(message ?? "Sign-in failed. Please try again.");
        return;
      }

      router.refresh();
      router.push("/dashboard");
    } catch {
      setError("Could not reach the server. Check that the API is running.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error ? (
        <p role="alert" className="rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-fg">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded border border-line-strong px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-fg">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded border border-line-strong px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
        />
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
