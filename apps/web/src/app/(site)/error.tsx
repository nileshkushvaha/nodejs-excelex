"use client";

import { useEffect } from "react";

import { ErrorScreen } from "@/components/error-screen";

export default function SiteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
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
          <a href="/" className="btn-secondary rounded-xl px-5 py-2.5 text-sm font-medium">
            Back to the home page
          </a>
        </>
      }
    />
  );
}
