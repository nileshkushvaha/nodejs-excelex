import { describe, expect, it, vi } from "vitest";

import { ErrorReporter, type ErrorReporterPort } from "./error-reporter";

describe("ErrorReporter", () => {
  it("is a no-op until an adapter is installed", () => {
    const reporter = new ErrorReporter();
    expect(reporter.enabled).toBe(false);
    expect(() => reporter.captureException(new Error("x"), { event: "t" })).not.toThrow();
  });

  it("redacts what it forwards and never lets the adapter's failure escape", () => {
    const port: ErrorReporterPort = {
      enabled: true,
      captureException: vi.fn(),
      captureMessage: vi.fn(() => {
        throw new Error("adapter down");
      }),
      flush: vi.fn(() => Promise.resolve()),
    };
    const reporter = new ErrorReporter();
    reporter.use(port);

    reporter.captureException(new Error("boom"), {
      event: "http.error",
      code: "internal_error",
      extra: { password: "hunter2", route: "/x" },
    });
    const call = (port.captureException as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[1]).toMatchObject({ event: "http.error", code: "internal_error", extra: { password: "[redacted]", route: "/x" } });

    expect(() => reporter.captureMessage("hello", { event: "t" })).not.toThrow();
  });
});
