import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@excelex/database";

import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";
import { paginate, type PageRequest } from "../masters/paged";
import { QueueService } from "./queue.service";
import type { JobName, QueueName } from "./job.types";

export interface JobListQuery extends PageRequest {
  status?: string;
  queue?: string;
  name?: string;
  scheduleId?: string;
  from?: string;
  to?: string;
  search?: string;
}

/**
 * The record of background work, as the monitor reads and acts on it.
 *
 * Reads are the Postgres row — client-scoped, so one client's failed import
 * is not another's problem to look at — with the live BullMQ state layered on
 * for a job still in Redis. Actions (retry, cancel) are recorded in the audit
 * trail like any other mutation, because "who cancelled the nightly sweep" is
 * exactly the question that gets asked afterwards.
 */
@Injectable()
export class JobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
  ) {}

  async list(query: JobListQuery) {
    const { clientId } = requireRequestContext();

    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    const where: Prisma.JobWhereInput = {
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.queue ? { queue: query.queue } : {}),
      ...(query.name ? { name: query.name } : {}),
      ...(query.scheduleId ? { scheduleId: query.scheduleId } : {}),
      ...(from && !Number.isNaN(from.getTime()) ? { createdAt: { gte: from } } : {}),
      ...(to && !Number.isNaN(to.getTime())
        ? { createdAt: { ...(from ? { gte: from } : {}), lte: to } }
        : {}),
      // Search is over the error text: the thing somebody remembers about a
      // failed job is what it said, not its id.
      ...(query.search ? { error: { contains: query.search, mode: "insensitive" } } : {}),
    };

    return this.prisma.forClient(clientId!, async (tx) => {
      const page = await paginate(
        tx.job,
        { where, orderBy: { createdAt: "desc" }, request: { page: query.page, pageSize: query.pageSize } },
        serialise,
      );
      const people = await requesters(tx, page.rows.map((row) => row.requestedById));
      return {
        ...page,
        rows: page.rows.map((row) => ({ ...row, requestedBy: people.get(row.requestedById ?? "") ?? null })),
      };
    });
  }

  async byId(id: string) {
    const { clientId } = requireRequestContext();

    const found = await this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.job.findFirst({ where: { id } });
      if (!row) return null;
      const people = await requesters(tx, [row.requestedById]);
      return { row, requestedBy: people.get(row.requestedById ?? "") ?? null };
    });
    if (!found) return null;
    const { row, requestedBy } = found;

    const live = await this.queues.liveState(row.queue as QueueName, row.id).catch(() => null);

    return {
      ...serialise(row),
      payload: row.payload,
      result: row.result,
      error: row.error,
      requestedBy,
      updatedAt: row.updatedAt.toISOString(),
      live,
    };
  }

  /** Queues the same work again, keeping the failed attempt in the history. */
  async retry(id: string): Promise<{ id: string }> {
    const { clientId, actor, ip, userAgent } = requireRequestContext();

    const original = await this.prisma.forClient(clientId!, async (tx) =>
      tx.job.findFirst({ where: { id } }),
    );
    if (!original) throw new NotFoundException("Job not found.");
    if (original.status === "RUNNING") {
      throw new BadRequestException("That job is still running. Wait for it to finish or fail.");
    }

    const created = await this.queues.enqueue(
      original.name as JobName,
      original.payload as Record<string, unknown>,
      {
        queue: original.queue as QueueName,
        maxAttempts: original.maxAttempts,
        // The retry belongs to the same schedule as the original, so a
        // schedule's history shows the re-run beside the failure it answers.
        scheduleId: original.scheduleId,
      },
    );

    await this.prisma.forClient(clientId!, async (tx) => {
      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "system.job.retried",
          entity: "job",
          entityId: original.id,
          metadata: { name: original.name, queue: original.queue, newJobId: created.id },
          ip,
          userAgent,
        },
      });
    });

    return created;
  }

  /**
   * Stops a job that has not started.
   *
   * Only that. A running handler cannot be interrupted safely from outside —
   * it holds a transaction — and a finished job has nothing to cancel. Both
   * are refused with the reason rather than quietly accepted.
   */
  async cancel(id: string): Promise<{ id: string; status: "CANCELLED" }> {
    const { clientId, actor, ip, userAgent } = requireRequestContext();

    const row = await this.prisma.forClient(clientId!, async (tx) => tx.job.findFirst({ where: { id } }));
    if (!row) throw new NotFoundException("Job not found.");
    if (row.status === "RUNNING") {
      throw new BadRequestException("That job is still running and cannot be cancelled.");
    }
    if (row.status !== "QUEUED") {
      throw new BadRequestException(`That job has already finished (${row.status.toLowerCase()}).`);
    }

    const outcome = await this.queues.removeIfWaiting(row.queue as QueueName, row.id);
    if (outcome === "running") {
      throw new BadRequestException("That job is still running and cannot be cancelled.");
    }
    // "gone" from Redis but QUEUED in Postgres is the visible failure the
    // queue service warns about: a row with no job. Cancelling it is the
    // right way to close it out, so it is not refused.

    const finishedAt = new Date();
    await this.prisma.forClient(clientId!, async (tx) => {
      await tx.job.update({
        where: { id: row.id },
        data: {
          status: "CANCELLED",
          startedAt: row.startedAt ?? finishedAt,
          finishedAt,
          durationMs: 0,
          error: `Cancelled by ${actor?.email ?? "system"}`,
        },
      });
      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "system.job.cancelled",
          entity: "job",
          entityId: row.id,
          metadata: { name: row.name, queue: row.queue, wasInRedis: outcome === "removed" },
          ip,
          userAgent,
        },
      });
    });

    return { id: row.id, status: "CANCELLED" };
  }
}

/**
 * Names for the requesters on a page, in one query. Not a relation on the
 * row — a job outlives the account that asked for it — so it is looked up.
 */
type ClientTx = Parameters<Parameters<PrismaService["forClient"]>[1]>[0];

async function requesters(
  tx: ClientTx,
  ids: Array<string | null>,
): Promise<Map<string, { fullName: string; email: string }>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return new Map();
  const users = await tx.user.findMany({
    where: { id: { in: wanted } },
    select: { id: true, fullName: true, email: true },
  });
  return new Map(users.map((user) => [user.id, { fullName: user.fullName, email: user.email }]));
}

export function serialise(row: {
  id: string;
  queue: string;
  name: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  scheduledFor: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationMs: number | null;
  error: string | null;
  scheduleId: string | null;
  requestedById: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    queue: row.queue,
    name: row.name,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    scheduledFor: row.scheduledFor?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    durationMs: row.durationMs,
    // Trimmed in the list: a stack trace belongs on the detail, not in a table.
    error: row.error ? row.error.split("\n")[0]! : null,
    scheduleId: row.scheduleId,
    requestedById: row.requestedById,
    createdAt: row.createdAt.toISOString(),
  };
}
