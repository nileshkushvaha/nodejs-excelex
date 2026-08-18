import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithRequestContext, type RequestContext } from "../../src/core/context/request-context";
import { PrismaService } from "../../src/core/database/prisma.service";
import { runRetentionSweep } from "../../src/jobs/handlers/retention-sweep.handler";
import { JOB_NAMES, QUEUES } from "../../src/jobs/job.types";
import { JobService } from "../../src/jobs/job.service";
import { QueueService } from "../../src/jobs/queue.service";
import { QueueMonitorService } from "../../src/system/queue/queue-monitor.service";
import { SchedulerService } from "../../src/system/scheduler/scheduler.service";
import { startApi } from "./harness";

/**
 * The scheduler and the monitor's actions, against real Redis and Postgres.
 *
 * The property worth proving is "once": a due schedule becomes one job even
 * when two dispatch passes overlap, and the job that results is attributed
 * to the schedule and reports back to it. Cancel and the retention sweep are
 * here too because they are the other two things the System screens do that
 * a mocked queue could not demonstrate.
 */
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const ACTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const context: RequestContext = {
  requestId: "test",
  host: "localhost",
  hostKind: "client",
  clientId: CLIENT_A,
  actor: {
    userId: ACTOR,
    email: "tester@example.test",
    fullName: "Tester",
    permissions: ["*"],
    grants: {} as never,
    branchIds: [],
  },
  startedAt: new Date(),
};

describe("the scheduler", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let scheduler: SchedulerService;
  let queues: QueueService;
  let jobs: JobService;
  const scheduleIds: string[] = [];
  const jobIds: string[] = [];

  beforeAll(async () => {
    app = await startApi();
    prisma = app.get(PrismaService);
    scheduler = app.get(SchedulerService);
    queues = app.get(QueueService);
    jobs = app.get(JobService);
  });

  afterAll(async () => {
    await prisma.forClient(CLIENT_A, async (tx) => {
      if (jobIds.length) await tx.job.deleteMany({ where: { id: { in: jobIds } } });
      if (scheduleIds.length) {
        await tx.job.deleteMany({ where: { scheduleId: { in: scheduleIds } } });
        await tx.jobSchedule.deleteMany({ where: { id: { in: scheduleIds } } });
      }
    });
    await app.close();
  });

  const settle = async (jobId: string, tries = 80) => {
    for (let attempt = 0; attempt < tries; attempt += 1) {
      const row = await prisma.forClient(CLIENT_A, async (tx) => tx.job.findFirst({ where: { id: jobId } }));
      if (row && row.status !== "QUEUED" && row.status !== "RUNNING") return row;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("The job never settled.");
  };

  it("dispatches a due schedule exactly once, even under overlapping ticks", async () => {
    const past = new Date(Date.now() - 60_000);
    const schedule = await prisma.forClient(CLIENT_A, async (tx) =>
      tx.jobSchedule.create({
        data: {
          clientId: CLIENT_A,
          name: `test schedule ${Date.now()}`,
          jobName: JOB_NAMES.HEARTBEAT,
          queue: QUEUES.SCHEDULED,
          cron: "* * * * *",
          timezone: "UTC",
          payload: { from: "scheduler test" },
          isActive: true,
          nextRunAt: past,
        },
      }),
    );
    scheduleIds.push(schedule.id);

    // Two passes at once. The in-process guard refuses the second, and even
    // without it the conditional claim would: either way, one job.
    const [first, second] = await Promise.all([scheduler.tickNow(), scheduler.tickNow()]);
    // A third pass afterwards finds nothing due from this schedule.
    await scheduler.tickNow();

    // The dispatcher may have found other clients' due schedules too; what
    // matters is how many jobs *this* schedule produced.
    expect(first + second).toBeGreaterThanOrEqual(1);

    const runs = await prisma.forClient(CLIENT_A, async (tx) =>
      tx.job.findMany({ where: { scheduleId: schedule.id } }),
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]!.scheduleId).toBe(schedule.id);
    expect(runs[0]!.requestedById).toBeNull();
    expect(runs[0]!.queue).toBe(QUEUES.SCHEDULED);

    const after = await prisma.forClient(CLIENT_A, async (tx) =>
      tx.jobSchedule.findFirst({ where: { id: schedule.id } }),
    );
    expect(after!.nextRunAt!.getTime()).toBeGreaterThan(Date.now() - 1_000);
    expect(after!.lastRunAt).not.toBeNull();

    const row = await settle(runs[0]!.id);
    expect(row.status).toBe("SUCCEEDED");

    // The worker reports the outcome back to the schedule in the same
    // transaction it records the job's.
    let lastStatus: string | null = null;
    for (let attempt = 0; attempt < 30 && lastStatus !== "SUCCEEDED"; attempt += 1) {
      const fresh = await prisma.forClient(CLIENT_A, async (tx) =>
        tx.jobSchedule.findFirst({ where: { id: schedule.id } }),
      );
      lastStatus = fresh?.lastStatus ?? null;
      if (lastStatus !== "SUCCEEDED") await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(lastStatus).toBe("SUCCEEDED");
  });

  it("cancels a delayed job and removes it from Redis", async () => {
    const { id } = await queues.enqueue(JOB_NAMES.HEARTBEAT, {}, {
      clientId: CLIENT_A,
      requestedById: null,
      delayMs: 60_000,
    });
    jobIds.push(id);

    const before = await queues.liveState(QUEUES.DEFAULT, id);
    expect(before?.state).toBe("delayed");

    const result = await runWithRequestContext(context, () => jobs.cancel(id));
    expect(result.status).toBe("CANCELLED");

    const row = await prisma.forClient(CLIENT_A, async (tx) => tx.job.findFirst({ where: { id } }));
    expect(row!.status).toBe("CANCELLED");
    expect(row!.finishedAt).not.toBeNull();
    expect(row!.error).toBe("Cancelled by tester@example.test");

    expect(await queues.liveState(QUEUES.DEFAULT, id)).toBeNull();

    // A second cancel is refused, with a reason.
    await expect(runWithRequestContext(context, () => jobs.cancel(id))).rejects.toThrow(/already finished/);
  });

  it("summarises the last day and week from Postgres", async () => {
    const monitor = app.get(QueueMonitorService);
    const summary = await runWithRequestContext(context, () => monitor.summary());

    // The heartbeat the schedule fired is in the last 24 hours, so the
    // scheduled queue has at least one success and a duration to report.
    const scheduled = summary.last24h.find((row) => row.queue === QUEUES.SCHEDULED && row.name === null);
    expect(scheduled?.succeeded).toBeGreaterThanOrEqual(1);
    expect(scheduled?.p95Ms).not.toBeNull();
    expect(summary.throughput.find((entry) => entry.queue === QUEUES.SCHEDULED)?.hours).toHaveLength(24);
    expect(summary.oldestWaiting).toHaveProperty(QUEUES.DEFAULT);
  });

  it("runs the retention sweep and reports what it removed", async () => {
    // A finished job from long ago, so the sweep has something to count.
    const old = await prisma.forClient(CLIENT_A, async (tx) =>
      tx.job.create({
        data: {
          clientId: CLIENT_A,
          queue: QUEUES.DEFAULT,
          name: JOB_NAMES.HEARTBEAT,
          status: "SUCCEEDED",
          attempts: 1,
          startedAt: new Date("2020-01-01T00:00:00Z"),
          finishedAt: new Date("2020-01-01T00:00:01Z"),
          durationMs: 1000,
          createdAt: new Date("2020-01-01T00:00:00Z"),
        },
      }),
    );

    const counts = await prisma.forClient(CLIENT_A, async (tx) =>
      runRetentionSweep(
        { clientId: CLIENT_A, jobId: "test", requestedById: null, payload: {} },
        tx,
      ),
    );

    expect(counts.jobs).toBeGreaterThanOrEqual(1);
    expect(counts).toHaveProperty("sessions");
    expect(counts).toHaveProperty("loginAttempts");

    const gone = await prisma.forClient(CLIENT_A, async (tx) => tx.job.findFirst({ where: { id: old.id } }));
    expect(gone).toBeNull();
  });
});
