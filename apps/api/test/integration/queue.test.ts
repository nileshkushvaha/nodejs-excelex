import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { JOB_NAMES, QUEUES } from "../../src/jobs/job.types";
import { QueueService } from "../../src/jobs/queue.service";
import { PrismaService } from "../../src/core/database/prisma.service";
import { startApi } from "./harness";

/**
 * The queue, end to end: enqueued, claimed by a worker, run inside the right
 * client's context, and recorded.
 *
 * Against real Redis and real Postgres, because the property worth asserting
 * is the one only they can demonstrate — that work running outside a request
 * still sees exactly one client's rows.
 */
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";

describe("the job queue", () => {
  let app: INestApplication;
  let queues: QueueService;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await startApi();
    queues = app.get(QueueService);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  const settle = async (clientId: string, jobId: string, tries = 60) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      const row = await prisma.forClient(clientId, async (tx) => tx.job.findFirst({ where: { id: jobId } }));
      if (row && row.status !== "QUEUED" && row.status !== "RUNNING") return row;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("The job never settled.");
  };

  it("runs a job and records what happened", async () => {
    const { id } = await queues.enqueue(JOB_NAMES.HEARTBEAT, { note: "from a test" }, {
      clientId: CLIENT_A,
      requestedById: null,
    });

    const row = await settle(CLIENT_A, id);

    expect(row.status).toBe("SUCCEEDED");
    expect(row.attempts).toBe(1);
    expect(row.startedAt).not.toBeNull();
    expect(row.finishedAt).not.toBeNull();
    // The duration is what a queue monitor charts; a job that never records
    // one looks instant, which is the least useful kind of wrong.
    expect(row.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("runs the job in its own client's context", async () => {
    const { id } = await queues.enqueue(JOB_NAMES.HEARTBEAT, {}, {
      clientId: CLIENT_A,
      requestedById: null,
    });
    const row = await settle(CLIENT_A, id);

    // The handler reports the client it saw. If the worker failed to seal the
    // context, this is where a job would run as nobody — or as whoever ran
    // last, which is the failure this whole design exists to prevent.
    expect((row.result as { clientId?: string })?.clientId).toBe(CLIENT_A);
  });

  it("keeps one client's jobs invisible to another", async () => {
    const { id } = await queues.enqueue(JOB_NAMES.HEARTBEAT, {}, {
      clientId: CLIENT_A,
      requestedById: null,
    });
    await settle(CLIENT_A, id);

    const seenByB = await prisma.forClient(CLIENT_B, async (tx) => tx.job.findFirst({ where: { id } }));

    // Row-level security, asserted from the job table rather than assumed
    // because it applies everywhere else.
    expect(seenByB).toBeNull();
  });

  it("records a failure with its reason rather than just failing", async () => {
    // A name with no handler: recorded as failed, with the reason, rather
    // than retried for ever in the hope a handler appears.
    const { id } = await queues.enqueue("system.nonexistent" as never, {}, {
      clientId: CLIENT_A,
      requestedById: null,
      maxAttempts: 1,
    });

    const row = await settle(CLIENT_A, id);

    expect(row.status).toBe("FAILED");
    expect(row.error).toMatch(/No handler/);
  });

  it("reports queue depth from Redis", async () => {
    const depth = await queues.depth(QUEUES.DEFAULT);

    expect(depth.queue).toBe(QUEUES.DEFAULT);
    expect(depth).toHaveProperty("waiting");
    expect(depth).toHaveProperty("failed");
  });
});
