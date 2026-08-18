/**
 * Enough of a user-agent parser for a login table.
 *
 * "Chrome · Windows" is what an operator needs to recognise their own sign-in
 * and notice a stranger's; a full device database is not. Ordered so that
 * strings which impersonate others resolve correctly — Edge and Opera carry
 * "Chrome", every browser carries "Mozilla", and Chrome on iOS calls itself
 * CriOS. The raw string is kept on the row for anyone who wants the rest.
 */
export interface Device {
  readonly browser: string | null;
  readonly os: string | null;
}

const BROWSERS: ReadonlyArray<[RegExp, string]> = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bChrome\/|\bCriOS\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
  [/\bcurl\//, "curl"],
  [/\bPostmanRuntime\//, "Postman"],
  [/\bnode(?:-fetch)?\b|\bundici\b/, "Node.js"],
];

const SYSTEMS: ReadonlyArray<[RegExp, string]> = [
  [/\bWindows NT 10\.0\b/, "Windows 10/11"],
  [/\bWindows\b/, "Windows"],
  [/\biPhone\b|\biPad\b|\biPod\b/, "iOS"],
  [/\bAndroid\b/, "Android"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bLinux\b/, "Linux"],
];

export function parseUserAgent(userAgent: string | null | undefined): Device {
  if (!userAgent) return { browser: null, os: null };
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
  const os = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
  return { browser, os };
}
