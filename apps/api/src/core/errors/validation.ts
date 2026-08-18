import type { z } from "zod";

import { ValidationError, type FieldError } from "./app-error";

/**
 * Zod at the boundary, once.
 *
 * Twenty controllers had the same three lines — safeParse, map the issues to
 * their messages, throw a BadRequest — and none of them kept the field path,
 * so a form with six errors could show one sentence and leave the person to
 * guess which box it meant. This keeps the messages exactly as they were (a
 * client reading `message[0]` sees what it saw before) and adds `errors` with
 * a path per issue, which is what a form needs to put the sentence next to
 * the field.
 */
export function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ValidationError(toFieldErrors(result.error));
  return result.data;
}

export function toFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Whether an arbitrary thrown value is a Zod error, without importing Zod's
 * class identity: two copies of Zod in a monorepo would make instanceof lie.
 */
export function isZodError(value: unknown): value is z.ZodError {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { name?: unknown }).name === "ZodError" &&
    Array.isArray((value as { issues?: unknown }).issues)
  );
}
