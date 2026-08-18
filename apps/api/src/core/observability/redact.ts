/**
 * What never reaches a log line.
 *
 * Applied to every structured field the logger is handed, so a careless
 * `logger.error({ body })` cannot ship a password. Keys are matched by name,
 * case-insensitively, anywhere in the object; values are replaced, not
 * dropped, so the shape stays readable.
 */
const SENSITIVE_KEY =
  /^(password|new_?password|current_?password|confirm_?password|pass|pwd|secret|token|access_?token|refresh_?token|api_?key|authorization|cookie|set-cookie|session|otp|totp|recovery_?code|card|cvv|pan|aadhaar)$/iu;

const REPLACEMENT = "[redacted]";
const MAX_DEPTH = 6;

export function redact<T>(value: T, depth = 0): T {
  if (depth > MAX_DEPTH) return "[truncated]" as unknown as T;
  if (Array.isArray(value)) {
    const entries: unknown[] = value;
    return entries.map((entry) => redact(entry, depth + 1)) as unknown as T;
  }
  if (value && typeof value === "object" && !(value instanceof Date) && !(value instanceof Error)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? REPLACEMENT : redact(entry, depth + 1);
    }
    return out as T;
  }
  return value;
}
