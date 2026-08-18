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
}

@Injectable()
export class JobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
  ) {}

  async list(query: JobListQuery) {
    const { clientId } = requireRequestContext();

    const where: Prisma.JobWhereInput = {
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.queue ? { queue: query.queue } : {}),
      ...(query.name ? { name: query.name } : {}),
    };

    return this.prisma.forClient(clientId!, async (tx) =>
      paginate(
        tx.job,
        { where, orderBy: { createdAt: "desc" }, request: { page: query.page, pageSize: query.pageSize } },
        serialise,
      ),
    );
  }

  async byId(id: string) {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.job.findFirst({ where: { id } });
      return row ? { ...serialise(row), payload: row.payload, error: row.error } : null;
    });
  }

  /** Queues the same work again, keeping the failed attempt in the history. */
  async retry(id: string): Promise<{ id: string }> {
    const { clientId } = requireRequestContext();

    const original = await this.prisma.forClient(clientId!, async (tx) =>
      tx.job.findFirst({ where: { id } }),
    );
    if (!original) throw new NotFoundException("Job not found.");
    if (original.status === "RUNNING") {
      throw new BadRequestException("That job is still running. Wait for it to finish or fail.");
    }

    return this.queues.enqueue(original.name as JobName, original.payload as Record<string, unknown>, {
      queue: original.queue as QueueName,
      maxAttempts: original.maxAttempts,
    });
  }
}

function serialise(row: {
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
    createdAt: row.createdAt.toISOString(),
  };
}
