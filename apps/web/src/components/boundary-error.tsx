"use client";

import { useEffect, type ReactNode } from "react";

import { decodeDigest } from "@/lib/api-error";
import { ErrorScreen } from "./error-screen";

/**
 * What every error boundary renders.
 *
 * Three boundaries (root, the application shell, the public site) had three
 * copies of the same component with different sentences. This is the one
 * body; each boundary passes its own words and its own way out.
 *
 * It knows one thing the boundaries do not: how to read the digest. When the
 * failure was the API not answering, the server-side read set a digest of
 * its own — status, code, reference — before Next replaced everything else
 * with a generic message. Decoding it turns "Something broke" into "The
 * system is unavailable, reference abc-123", which is what support needs and
 * what the reader can act on (wait, then try again). Any other digest is
 * Next's own hash and is shown as the reference it is.
 */
export function BoundaryError({
  error,
  retry,
  title,
  body,
  actions,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  title?: string;
  body?: string;
  actions?: ReactNode;
}) {
  useEffect(() => {
    // The console is always the local log; the reporter, when configured
    // (instrumentation-client.ts), gets the same error under the same
    // reference the person sees. Kept out of render so it fires once.
    console.error(error);
    window.__excelexReport?.(error, error.digest);
  }, [error]);

  const development = process.env.NODE_ENV !== "production";
  const decoded = decodeDigest(error.digest);
  const status = decoded ? (decoded.status === 0 ? 502 : decoded.status) : 500;
  const reference = decoded ? (decoded.reference ?? undefined) : error.digest;

  return (
    <ErrorScreen
      status={status}
      // An outage has its own wording in ErrorScreen's table; the caller's
      // title and body are for the generic case only.
      title={decoded ? undefined : title}
      body={decoded ? undefined : body}
      detail={development ? (error.stack ?? error.message) : undefined}
      digest={reference}
      code={decoded?.code}
      actions={
        actions ?? (
          <button
            type="button"
            onClick={() => retry()}
            className="btn-primary rounded-xl px-5 py-2.5 text-sm font-medium"
          >
            Try again
          </button>
        )
      }
    />
  );
}
