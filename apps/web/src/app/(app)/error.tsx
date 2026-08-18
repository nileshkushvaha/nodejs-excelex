"use client";

import { BoundaryError } from "@/components/boundary-error";

/**
 * A screen inside the application usually failed because the API refused or
 * did not answer, so the recovery offered is to retry this screen rather than
 * to leave for the dashboard.
 */
export default function AppSectionError({
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
      title="This screen could not be loaded"
      body="The page reached the server but something behind it failed. Nothing you were editing has been saved."
    />
  );
}
