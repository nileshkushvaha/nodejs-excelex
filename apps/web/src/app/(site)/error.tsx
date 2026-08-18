"use client";

import { BoundaryError } from "@/components/boundary-error";

/** The public site's boundary: the way out is the home page. */
export default function SiteError({
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
          <a href="/" className="btn-secondary rounded-xl px-5 py-2.5 text-sm font-medium">
            Back to the home page
          </a>
        </>
      }
    />
  );
}
