import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id at the OWASP baseline: 19 MiB memory, 2 iterations, parallelism 1.
 *
 * These belong in a dedicated auth package. They live here because the seed
 * script and the API must agree on them exactly, and one shared constant is a
 * smaller mistake than the same three numbers written twice. Move them when
 * packages/permissions or packages/auth exists.
 *
 * Tune against the target host before launch — the baseline is a floor, not a
 * measurement.
 */
const ARGON2ID_OPTIONS = {
  algorithm: 2, // Argon2id
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, ARGON2ID_OPTIONS);
}

/**
 * Returns false rather than throwing on a malformed or absent hash. A user row
 * with no password (invited but never activated) must fail authentication the
 * same way a wrong password does, so the response cannot distinguish them.
 */
export async function verifyPassword(
  storedHash: string | null | undefined,
  plaintext: string,
): Promise<boolean> {
  if (!storedHash) return false;
  try {
    return await verify(storedHash, plaintext, ARGON2ID_OPTIONS);
  } catch {
    return false;
  }
}
