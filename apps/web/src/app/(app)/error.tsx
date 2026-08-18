"use client";

import { useEffect } from "react";

import { ErrorScreen } from "@/components/error-screen";

export default function AppSectionError({
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

  // A screen inside the application usually failed because the API refused
  // or did not answer, so the recovery offered is to retry this screen rather
  // than to leave for the dashboard.
  return (
    <ErrorScreen
      status={500}
      title="This screen could not be loaded"
      body="The page reached the server but something behind it failed. Nothing you were editing has been saved."
      detail={development ? (error.stack ?? error.message) : undefined}
      digest={error.digest}
      actions={
        <button
          type="button"
          onClick={() => retry()}
          className="btn-primary rounded-xl px-5 py-2.5 text-sm font-medium"
        >
          Try again
        </button>
      }
    />
  );
}
