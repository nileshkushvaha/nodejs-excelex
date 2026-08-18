"use client";

import { useEffect } from "react";

import "./globals.css";

/**
 * The last boundary: an error in the root layout itself.
 *
 * It replaces the layout, so it must bring its own <html> and <body> — and it
 * cannot use anything the layout provides, which includes the theme script.
 * That is why this one page is styled inline against the OS colour scheme
 * rather than through the design tokens: at the point this renders, the thing
 * that defines those tokens is what failed.
 */
export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          background: "#0d1730",
          color: "#e6edf9",
        }}
      >
        <main style={{ maxWidth: "34rem", textAlign: "center" }}>
          <p style={{ fontSize: "4rem", fontWeight: 600, margin: 0, color: "#4d84ff" }}>500</p>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: "0.5rem 0 0" }}>
            The application failed to start
          </h1>
          <p style={{ margin: "0.75rem 0 0", lineHeight: 1.6, color: "#93a3c0" }}>
            Something broke before the page could be built. The error has been recorded.
          </p>

          {development && error.stack ? (
            <pre
              style={{
                marginTop: "1.5rem",
                padding: "1rem",
                textAlign: "left",
                fontSize: "0.75rem",
                lineHeight: 1.6,
                overflow: "auto",
                maxHeight: "16rem",
                borderRadius: "0.75rem",
                border: "1px solid #b45309",
                background: "#451a03",
                color: "#fde68a",
              }}
            >
              {error.stack}
            </pre>
          ) : null}

          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: "2rem",
              padding: "0.75rem 1.5rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#ffffff",
              background: "linear-gradient(135deg, #0a2360 0%, #2f5ce8 50%, #22bcd8 100%)",
              border: "none",
              borderRadius: "0.75rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>

          {error.digest ? (
            <p style={{ marginTop: "1.5rem", fontSize: "0.75rem", color: "#6a7b9c" }}>
              Reference <span style={{ fontFamily: "monospace" }}>{error.digest}</span>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
