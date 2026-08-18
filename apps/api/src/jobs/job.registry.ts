import { Injectable, Logger } from "@nestjs/common";

import { JOB_NAMES, type JobEnvelope } from "./job.types";

/** What a handler is given: its envelope, and a client-scoped transaction. */
export type JobHandler = (envelope: JobEnvelope, tx: unknown) => Promise<unknown>;

/**
 * What each job name does.
 *
 * A registry rather than a switch in the worker, so a feature can register its
 * own background work beside the code that needs it, and so the worker has no
 * opinion about what any job means.
 */
@Injectable()
export class JobRegistry {
  private readonly logger = new Logger(JobRegistry.name);
  private readonly handlers = new Map<string, JobHandler>();

  register(name: string, handler: JobHandler): void {
    if (this.handlers.has(name)) {
      // Two handlers for one name is a wiring mistake, and the second would
      // silently win. Better to say so at boot than to run the wrong one.
      throw new Error(`A handler is already registered for "${name}".`);
    }
    this.handlers.set(name, handler);
    this.logger.log(`Registered handler for ${name}`);
  }

  handler(name: string): JobHandler | undefined {
    return this.handlers.get(name);
  }

  names(): string[] {
    return [...this.handlers.keys()].sort();
  }
}

/** The one job that exists to prove the queue works, registered by default. */
export function registerHeartbeat(registry: JobRegistry): void {
  registry.register(JOB_NAMES.HEARTBEAT, async (envelope) => ({
    ok: true,
    clientId: envelope.clientId,
    at: new Date().toISOString(),
  }));
}
