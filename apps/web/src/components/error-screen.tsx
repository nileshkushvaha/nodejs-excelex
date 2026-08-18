import Link from "next/link";
import type { ReactNode } from "react";

/**
 * What each status actually means to the person reading it.
 *
 * Not the RFC wording. "Unprocessable Entity" tells a booking clerk nothing;
 * "the details did not pass validation" tells them to look at the form. Every
 * entry says what happened, and where it leaves them.
 */
const STATUSES: Record<number, { title: string; body: string }> = {
  400: {
    title: "That request could not be read",
    body: "Something in the address or the form was malformed. Going back and trying again usually clears it.",
  },
  401: {
    title: "You are signed out",
    body: "Your session has ended, either because it expired or because it was signed out somewhere else.",
  },
  403: {
    title: "You do not have access to this",
    body: "Your account is signed in but does not hold the permission this screen needs. An administrator can grant it.",
  },
  404: {
    title: "That page does not exist",
    body: "The address may be mistyped, or the record may have been deleted since the link was made.",
  },
  405: {
    title: "That action is not allowed here",
    body: "The page was asked to do something it does not support. This is a fault on our side, not yours.",
  },
  408: {
    title: "That took too long",
    body: "The request timed out before it finished. Nothing was saved — try it again.",
  },
  409: {
    title: "Somebody else changed this first",
    body: "The record was edited while this page was open. Reload it to see the current version before saving again.",
  },
  410: {
    title: "That has been removed",
    body: "The page existed once and has since been deleted. There is nothing to show at this address.",
  },
  413: {
    title: "That file is too large",
    body: "The upload exceeded the size this screen accepts. Split the file and try again.",
  },
  422: {
    title: "Those details could not be accepted",
    body: "The request was understood but something in it failed validation. The form will say which field.",
  },
  429: {
    title: "Too many attempts",
    body: "You have made more requests than the limit allows. Wait a minute and try again.",
  },
  500: {
    title: "Something broke on our side",
    body: "The error has been recorded. Nothing you did caused it, and nothing you were working on was lost unless the page says otherwise.",
  },
  502: {
    title: "We could not reach part of the system",
    body: "A service this page depends on did not answer. It is usually brief — try again in a moment.",
  },
  503: {
    title: "The system is unavailable",
    body: "We are either under maintenance or under more load than we can serve. It will be back shortly.",
  },
  504: {
    title: "A service took too long to answer",
    body: "The request reached us but timed out waiting on something behind it. Trying again often works.",
  },
};

/**
 * The error page.
 *
 * One component for every status, because an error screen has one job in
 * every case: say what happened, say whether it was the reader's doing, and
 * offer the way out. Six near-identical files would drift.
 *
 * `detail` is only ever passed in development. In production a stack trace or
 * a database message on an error page is a gift to whoever is probing the
 * system, and it is meaningless to the person who hit it — they get the
 * digest instead, which is the string support needs to find the log line.
 */
export function ErrorScreen({
  status,
  title,
  body,
  detail,
  digest,
  code,
  actions,
}: {
  status: number;
  title?: string;
  body?: string;
  detail?: string;
  digest?: string;
  /** The API's error code, when the failure was one it named. */
  code?: string;
  actions?: ReactNode;
}) {
  const known = STATUSES[status] ?? STATUSES[500]!;

  return (
    <div className="relative isolate flex min-h-[70vh] items-center justify-center overflow-hidden px-5 py-16">
      <div aria-hidden className="aurora -z-20 opacity-50" />
      <div aria-hidden className="grain -z-10" />

      <div className="w-full max-w-lg text-center">
        <p className="brand-text text-7xl font-semibold tracking-tight tabular-nums sm:text-8xl">
          {status}
        </p>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
          {title ?? known.title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">{body ?? known.body}</p>

        {detail ? (
          // Development only. The border and the label are there so nobody
          // mistakes this for something a customer is meant to read.
          <pre className="mt-6 max-h-64 overflow-auto rounded-xl border border-amber-300 bg-amber-50 p-4 text-left text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
            <span className="mb-2 block font-semibold uppercase tracking-wide">
              Development detail — not shown in production
            </span>
            {detail}
          </pre>
        ) : null}

        <div className="mt-8 flex flex-wrap justify-center gap-3">{actions}</div>

        {digest || code ? (
          // The one thing worth showing in production: the identifier that
          // matches this page to a line in the server log — and the code,
          // which tells support what kind of failure before they look.
          <p className="mt-6 text-xs text-faint">
            {digest ? (
              <>
                Reference <span className="font-mono">{digest}</span>
              </>
            ) : null}
            {digest && code ? " · " : null}
            {code ? <span className="font-mono">{code}</span> : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** The two links every error page offers, so they read the same everywhere. */
export function ErrorActions({ home = "/dashboard" }: { home?: string }) {
  return (
    <>
      <Link href={home} className="btn-primary rounded-xl px-5 py-2.5 text-sm font-medium">
        Go to dashboard
      </Link>
      <Link href="/" className="btn-secondary rounded-xl px-5 py-2.5 text-sm font-medium">
        Back to the site
      </Link>
    </>
  );
}

export { STATUSES as ERROR_STATUSES };
