import { describe, expect, it } from "vitest";

import { SecretBox } from "./secret-box";

describe("SecretBox", () => {
  const box = new SecretBox("ZGV2ZWxvcG1lbnQtb25seS1zZWNyZXRzLWtleS0wMDE=");

  it("seals and opens, and two seals of one value differ", () => {
    const a = box.seal("hunter2");
    const b = box.seal("hunter2");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1:")).toBe(true);
    expect(box.open(a)).toBe("hunter2");
    expect(box.open(b)).toBe("hunter2");
  });

  it("refuses a tampered value and a wrong key", () => {
    const sealed = box.seal("secret");
    const [v, iv, tag, body] = sealed.split(":");
    const flipped = Buffer.from(body!, "base64");
    flipped[0] = flipped[0]! ^ 0xff;
    expect(() => box.open([v, iv, tag, flipped.toString("base64")].join(":"))).toThrow();
    const other = new SecretBox(Buffer.alloc(32, 7).toString("base64"));
    expect(() => other.open(sealed)).toThrow();
  });

  it("insists on a 32-byte key", () => {
    expect(() => new SecretBox("c2hvcnQ=")).toThrow(/32 bytes/);
  });
});
