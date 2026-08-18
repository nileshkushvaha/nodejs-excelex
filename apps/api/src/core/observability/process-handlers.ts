import { Logger, type INestApplication } from "@nestjs/common";

/**
 * What happens when something fails outside any request.
 *
 * An unhandled promise rejection or an uncaught exception means the process
 * is in a state nobody wrote code for. Node's default is to print and exit
 * for the latter and — since v15 — for the former too, which is right; what
 * it does not do is say so in the log shape everything else uses, or give the
 * open connections a moment to close. This does both, once, and then exits
 * with a non-zero code so the supervisor restarts a clean process rather than
 * letting a wounded one limp on.
 *
 * Deliberately not "log and carry on". A process that has thrown somewhere
 * unknown may have a half-written transaction or a claimed job it will never
 * finish; restarting is the safe recovery, and the supervisor exists for it.
 */
const SHUTDOWN_GRACE_MS = 5_000;

export function installProcessHandlers(app: INestApplication): void {
  const logger = new Logger("Process");
  let exiting = false;

  const fail = (event: string, reason: unknown): void => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.fatal({ event, name: error.name, message: error.message }, error.stack);

    if (exiting) return; // A second failure while closing: the timer below still fires.
    exiting = true;

    const timer = setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS);
    timer.unref();
    void app
      .close()
      .catch(() => undefined)
      .finally(() => process.exit(1));
  };

  process.on("unhandledRejection", (reason) => fail("process.unhandled_rejection", reason));
  process.on("uncaughtException", (error) => fail("process.uncaught_exception", error));
  process.on("warning", (warning) => {
    // Deprecations and MaxListeners warnings: worth a line, not a restart.
    logger.warn({ event: "process.warning", name: warning.name, message: warning.message });
  });
}
