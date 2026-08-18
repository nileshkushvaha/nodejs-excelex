import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";

import { RequirePermission } from "../../auth/auth.guard";
import { JobRegistry } from "../../jobs/job.registry";
import { JOB_NAMES, QUEUES, type JobName, type QueueName } from "../../jobs/job.types";
import { JobService } from "../../jobs/job.service";
import { QueueService } from "../../jobs/queue.service";

const enqueueSchema = z.object({
  name: z.enum(Object.values(JOB_NAMES) as [JobName, ...JobName[]]),
  payload: z.record(z.string(), z.unknown()).default({}),
  queue: z.enum(Object.values(QUEUES) as [QueueName, ...QueueName[]]).default(QUEUES.DEFAULT),
});

/**
 * The queue monitor's data.
 *
 * Two sources, because they answer different questions. Redis says what is
 * waiting and running right now; Postgres says what happened, survives a
 * flush, and is client-scoped so one client cannot see another's work.
 */
@Controller({ path: "system", version: "1" })
export class QueueController {
  constructor(
    private readonly jobs: JobService,
    private readonly queues: QueueService,
    private readonly registry: JobRegistry,
  ) {}

  @Get("queues")
  @RequirePermission("settings.general.view")
  async queueDepths() {
    const depths = await Promise.all(
      Object.values(QUEUES).map((name) => this.queues.depth(name as QueueName)),
    );
    return { queues: depths, handlers: this.registry.names() };
  }

  @Get("jobs")
  @RequirePermission("settings.general.view")
  list(@Query() query: Record<string, string>) {
    return this.jobs.list({
      page: Number(query["page"] ?? 1) || 1,
      pageSize: Number(query["pageSize"] ?? 20) || 20,
      status: query["status"],
      queue: query["queue"],
      name: query["name"],
    });
  }

  @Get("jobs/:id")
  @RequirePermission("settings.general.view")
  async byId(@Param("id", ParseUUIDPipe) id: string) {
    const row = await this.jobs.byId(id);
    if (!row) throw new BadRequestException("Job not found.");
    return row;
  }

  @Post("jobs")
  @RequirePermission("settings.general.manage")
  enqueue(@Body() body: unknown) {
    const input = enqueueSchema.safeParse(body);
    if (!input.success) {
      throw new BadRequestException(input.error.issues.map((issue) => issue.message));
    }

    return this.queues.enqueue(input.data.name, input.data.payload as Record<string, unknown>, {
      queue: input.data.queue,
    });
  }

  @Post("jobs/:id/retry")
  @RequirePermission("settings.general.manage")
  retry(@Param("id", ParseUUIDPipe) id: string) {
    // Re-queued as a new job rather than resurrecting the old one, so the
    // history keeps both attempts and the reason the first failed.
    return this.jobs.retry(id);
  }
}
