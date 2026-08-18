import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import {
  createClientPrisma,
  createJobsPrisma,
  createPlatformPrisma,
  resolveClientByHost,
  withClientContext,
  type ClientPrisma,
  type JobsPrisma,
  type PlatformPrisma,
  type ResolvedClient,
} from "@excelex/database";

import { ENVIRONMENT, type Environment } from "../config/environment";

/**
 * The two database handles, and the only supported way to reach client data.
 *
 * There is deliberately no method that returns a raw, unscoped client handle.
 * Client-scoped work goes through forClient(), which opens the transaction that
 * makes row-level security meaningful; anything else would be a code path where
 * one of the two barriers is absent.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly clientPrisma: ClientPrisma;
  private readonly platformPrisma: PlatformPrisma;
  private readonly jobsPrisma: JobsPrisma;

  constructor(@Inject(ENVIRONMENT) environment: Environment) {
    this.clientPrisma = createClientPrisma({ connectionString: environment.DATABASE_URL });
    this.platformPrisma = createPlatformPrisma(environment.DATABASE_PLATFORM_URL);
    this.jobsPrisma = createJobsPrisma(environment.DATABASE_JOBS_URL);
  }

  /**
   * Runs `fn` inside a transaction with the client context sealed at both
   * layers: the extension injects clientId into every query, and
   * `app.client_id` is set transaction-locally so RLS admits only this client's
   * rows.
   */
  forClient<T>(
    clientId: string,
    fn: Parameters<typeof withClientContext<T>>[2],
  ): Promise<T> {
    return withClientContext(this.clientPrisma, clientId, fn);
  }

  /** Resolves a hostname through the SECURITY DEFINER accessor. */
  resolveHost(hostname: string): Promise<ResolvedClient | null> {
    return resolveClientByHost(this.clientPrisma, hostname);
  }

  /** The control plane. Platform models only — they carry no clientId. */
  get platform(): PlatformPrisma {
    return this.platformPrisma;
  }

  /**
   * The background runtime's cross-client handle.
   *
   * Only for the enumerated tables the excelex_jobs role may read across
   * clients — the scheduler's dispatch scan and the session sweep. Anything
   * else it touches is refused by the database, which is the point: a job
   * that needs a client's data goes through forClient() like a request does.
   */
  get jobs(): JobsPrisma {
    return this.jobsPrisma;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      this.clientPrisma.$disconnect(),
      this.platformPrisma.$disconnect(),
      this.jobsPrisma.$disconnect(),
    ]);
  }
}
