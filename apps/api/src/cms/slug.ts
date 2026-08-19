import slugifyLib from "slugify";

/**
 * URL slugs, the way WordPress makes them and a little stricter: lowercase
 * ASCII, hyphens, no leading or trailing hyphen, at most 120 characters. A
 * caller wanting uniqueness passes what exists and gets `-2`, `-3`… back,
 * which is what people expect to see rather than a random suffix.
 */
export function slugify(input: string): string {
  const slug = slugifyLib(input, { lower: true, strict: true, trim: true }).slice(0, 120).replace(/^-+|-+$/gu, "");
  return slug || "untitled";
}

export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 10_000; n += 1) {
    const candidate = `${base}-${n}`.slice(0, 120);
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
