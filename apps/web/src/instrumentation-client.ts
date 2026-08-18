/**
 * Browser-side error reporting.
 *
 * Off unless NEXT_PUBLIC_SENTRY_DSN is set, in which case the browser SDK is
 * loaded after the page is interactive rather than bundled into every
 * route. What it reports: exceptions the error boundaries catch (through
 * `reportBoundaryError`) and unhandled ones the SDK sees itself. What it
 * never sends: personal data — `sendDefaultPii` is off and no user is set.
 * A boundary that shows an API failure passes the API's reference along as
 * a tag, so the browser report, the API report and the log line share it.
 */
import { decodeDigest } from "@/lib/api-error";

type Browser = typeof import("@sentry/browser");

declare global {
  interface Window {
    __excelexReport?: (error: unknown, digest?: string) => void;
  }
}

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn && typeof window !== "undefined") {
  void import("@sentry/browser").then((Sentry: Browser) => {
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
    window.__excelexReport = (error, digest) => {
      Sentry.withScope((scope) => {
        scope.setTag("event", "web.boundary");
        const decoded = decodeDigest(digest);
        if (decoded) {
          // The API already reported this failure; the browser report only
          // says a person saw it, under the same reference.
          scope.setTag("requestId", decoded.reference ?? "");
          scope.setTag("code", decoded.code);
          scope.setLevel("warning");
          Sentry.captureMessage(`API failure shown to a person: ${decoded.code}`);
          return;
        }
        if (digest) scope.setTag("digest", digest);
        Sentry.captureException(error);
      });
    };
  });
}

export {};
