"use client";

import { useEffect } from "react";

import { ErrorScreen } from "@/components/error-screen";

/**
 * The uncaught-exception boundary for everything under app/.
 *
 * `retry` rather than `reset` — this version of Next re-runs the segment
 * inside a transition, which keeps client state outside the boundary intact.
 *
 * The error's message is shown only in development. In production Next
 * already replaces it with a digest before it reaches the browser; passing it
 * through anyway would be a habit that leaks the day someone renders this
 * boundary with a locally-thrown error instead.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Until an error reporter is wired up, the console is the log. Kept out
    // of render so it fires once rather than on every re-render.
    console.error(error);
  }, [error]);

  const development = process.env.NODE_ENV !== "production";

  return (
    <ErrorScreen
      status={500}
      detail={development ? (error.stack ?? error.message) : undefined}
      digest={error.digest}
      actions={
        <>
          <button
            type="button"
            onClick={() => retry()}
            className="btn-primary rounded-xl px-5 py-2.5 text-sm font-medium"
          >
            Try again
          </button>
          <a href="/dashboard" className="btn-secondary rounded-xl px-5 py-2.5 text-sm font-medium">
            Go to dashboard
          </a>
        </>
      }
    />
  );
}
