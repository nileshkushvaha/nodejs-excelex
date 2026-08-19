import { describe, expect, it } from "vitest";

import { excerptOf, plainTextOf, sanitizeBody } from "./html-sanitizer";

describe("sanitizeBody", () => {
  it("keeps an article's markup", () => {
    const html = '<h2>Title</h2><p class="lead">Hello <strong>world</strong> <a href="https://x.test" target="_blank">link</a></p><ul><li>one</li></ul><img src="/api/v1/public/media/11111111-1111-4111-8111-111111111111/2026/08/abc-x.png" alt="x">';
    const out = sanitizeBody(html);
    expect(out).toContain("<h2>Title</h2>");
    expect(out).toContain('class="lead"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('loading="lazy"');
    expect(out).toContain("/api/v1/public/media/");
  });

  it("removes scripts, handlers, styles and unknown schemes", () => {
    const html = '<p onclick="x()">a</p><script>alert(1)</script><a href="javascript:alert(1)">b</a><img src="data:image/png;base64,AAAA"><style>p{}</style><p style="color:red">c</p><iframe src="https://evil.test/x"></iframe>';
    const out = sanitizeBody(html);
    expect(out).not.toMatch(/script|onclick|javascript:|data:|style/);
    expect(out).not.toContain("evil.test");
  });

  it("allows only known embed hosts in iframes", () => {
    expect(sanitizeBody('<iframe src="https://www.youtube.com/embed/abc"></iframe>')).toContain("youtube.com");
  });

  it("derives plain text and an excerpt", () => {
    const text = plainTextOf("<p>Hello&nbsp;<b>world</b>, again.</p>");
    expect(text).toBe("Hello world, again.");
    expect(excerptOf("a b c d e", 3)).toBe("a b c…");
  });
});
