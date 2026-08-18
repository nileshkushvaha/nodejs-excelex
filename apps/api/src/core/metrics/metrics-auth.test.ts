import { describe, expect, it } from "vitest";

import { metricsScrapeAllowed } from "./metrics-auth";

const TOKEN = "0123456789abcdef0123";

describe("metricsScrapeAllowed", () => {
  it("refuses in production when no token is configured", () => {
    expect(metricsScrapeAllowed({ nodeEnv: "production", token: undefined, authorization: undefined })).toBe(false);
  });

  it("allows outside production when no token is configured", () => {
    expect(metricsScrapeAllowed({ nodeEnv: "development", token: undefined, authorization: undefined })).toBe(true);
    expect(metricsScrapeAllowed({ nodeEnv: "test", token: undefined, authorization: undefined })).toBe(true);
  });

  it("accepts the correct bearer token", () => {
    expect(metricsScrapeAllowed({ nodeEnv: "production", token: TOKEN, authorization: `Bearer ${TOKEN}` })).toBe(true);
  });

  it("refuses a wrong-length token without throwing", () => {
    expect(() =>
      metricsScrapeAllowed({ nodeEnv: "production", token: TOKEN, authorization: "Bearer short" }),
    ).not.toThrow();
    expect(metricsScrapeAllowed({ nodeEnv: "production", token: TOKEN, authorization: "Bearer short" })).toBe(false);
  });

  it("refuses a same-length wrong token, a missing header and a non-bearer scheme", () => {
    expect(
      metricsScrapeAllowed({ nodeEnv: "production", token: TOKEN, authorization: `Bearer ${TOKEN.slice(0, -1)}X` }),
    ).toBe(false);
    expect(metricsScrapeAllowed({ nodeEnv: "development", token: TOKEN, authorization: undefined })).toBe(false);
    expect(metricsScrapeAllowed({ nodeEnv: "development", token: TOKEN, authorization: `Basic ${TOKEN}` })).toBe(false);
  });
});
