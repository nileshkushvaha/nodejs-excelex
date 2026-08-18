import { describe, expect, it } from "vitest";

import { redact } from "./redact";

describe("redact", () => {
  it("replaces secret-shaped keys at any depth and keeps the shape", () => {
    const out = redact({
      email: "a@b.c",
      password: "hunter2",
      nested: { Authorization: "Bearer x", list: [{ token: "t" }, { fine: 1 }] },
    });
    expect(out).toEqual({
      email: "a@b.c",
      password: "[redacted]",
      nested: { Authorization: "[redacted]", list: [{ token: "[redacted]" }, { fine: 1 }] },
    });
  });

  it("leaves primitives, dates and errors alone", () => {
    const date = new Date();
    expect(redact(date)).toBe(date);
    expect(redact("password")).toBe("password");
  });
});
