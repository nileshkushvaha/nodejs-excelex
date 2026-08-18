"use client";

import { BoundaryError } from "@/components/boundary-error";

/**
 * The uncaught-exception boundary for everything under app/.
 *
 * `retry` rather than `reset` — this version of Next re-runs the segment
 * inside a transition, which keeps client state outside the boundary intact.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <BoundaryError
      error={error}
      retry={retry}
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
