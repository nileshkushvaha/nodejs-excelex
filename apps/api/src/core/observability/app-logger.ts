import { ConsoleLogger, type LogLevel } from "@nestjs/common";

/**
 * The process's logger, configured once from the environment.
 *
 * Nest 11's ConsoleLogger already knows how to print JSON; what this adds is
 * the decision of when. Production writes one JSON object per line — the
 * shape every log shipper (CloudWatch, Loki, Datadog) ingests without a
 * parser — with a timestamp and the process id so lines from several API
 * instances can be told apart. Development keeps the coloured text a person
 * reads in a terminal.
 *
 * LOG_LEVEL is the single knob. "log" in production; "debug" when chasing
 * something; never "verbose" in production, where it would print every query.
 */
const LEVELS: readonly LogLevel[] = ["fatal", "error", "warn", "log", "debug", "verbose"];

export function createAppLogger(options: { json: boolean; level: string }): ConsoleLogger {
  const index = LEVELS.indexOf(options.level as LogLevel);
  const enabled = LEVELS.slice(0, (index === -1 ? LEVELS.indexOf("log") : index) + 1);

  return new ConsoleLogger({
    json: options.json,
    colors: !options.json,
    logLevels: enabled,
    timestamp: false,
    prefix: "excelex",
  });
}
