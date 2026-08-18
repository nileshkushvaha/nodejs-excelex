import type { LoggerService } from "@nestjs/common";

import { currentRequestContext } from "../context/request-context";
import { redact } from "./redact";

/**
 * A log line with fields, not a sentence with values inside it.
 *
 * `logger.error(\`Tick failed: ${message}\`)` cannot be filtered by client,
 * counted by kind, or joined to the request that caused it. This helper takes
 * an event name and a bag of fields, adds the request correlation (requestId,
 * clientId, actor) when there is a request, redacts anything secret-shaped,
 * and hands the object to Nest's logger — which prints it as JSON in
 * production and as readable text in development.
 *
 * The event name is a stable dotted identifier ("http.error", "job.failed"),
 * chosen so a dashboard can group on it and a person can grep for it.
 */
export type LogLevel = "error" | "warn" | "log" | "debug" | "verbose";

export interface LogFields {
  readonly [key: string]: unknown;
}

export function logEvent(
  logger: LoggerService,
  level: LogLevel,
  event: string,
  fields: LogFields = {},
  stack?: string,
): void {
  const context = currentRequestContext();
  const record: Record<string, unknown> = {
    event,
    ...(context
      ? {
          requestId: context.requestId,
          clientId: context.clientId,
          actorId: context.actor?.userId,
          host: context.host,
        }
      : {}),
    ...redact(fields),
  };

  // Nest's logger signature is (message, ...optionalParams); for `error` the
  // second parameter is the stack. An object message is printed as JSON in
  // json mode and inspected in text mode — the same call works for both.
  if (level === "error") logger.error(record, stack);
  else if (level === "warn") logger.warn(record);
  else if (level === "debug") logger.debug?.(record);
  else if (level === "verbose") logger.verbose?.(record);
  else logger.log(record);
}
