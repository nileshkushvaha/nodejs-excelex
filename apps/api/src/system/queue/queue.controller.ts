import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";

import { RequirePermission } from "../../auth/auth.guard";
import { JOB_NAMES, QUEUES, type JobName, type QueueName } from "../../jobs/job.types";
import { JobService } from "../../jobs/job.service";
import { QueueService } from "../../jobs/queue.service";
import { readPageRequest } from "../../masters/paged";
import { QueueMonitorService } from "./queue-monitor.service";
import { parseOrThrow } from "../../core/errors/validation";

const enqueueSchema = z.object({
  name: z.enum(Object.values(JOB_NAMES) as [JobName, ...JobName[]]),
  payload: z.record(z.string(), z.unknown()).default({}),
  queue: z.enum(Object.values(QUEUES) as [QueueName, ...QueueName[]]).default(QUEUES.DEFAULT),
});

const cleanSchema = z.object({
  state: z.enum(["completed", "failed"], { message: "State must be completed or failed." }),
  olderThanMinutes: z
    .number({ message: "olderThanMinutes must be a number." })
    .int()
    .min(0, "olderThanMinutes cannot be negative.")
    .max(60 * 24 * 365, "olderThanMinutes is too large."),
});

/**
 * The queue monitor's data.
 *
 * Two sources, because they answer different questions. Redis says what is
 * waiting and running right now, and is the same for every client — the
 * queue is shared across the deployment. Postgres says what happened,
 * survives a flush, and is client-scoped so one client cannot see another's
 * work.
 *
 * Pause, resume and clean therefore act platform-wide: they change Redis,
 * and every client's jobs sit in the same Redis. The permission that grants
 * them is `system.queue.manage`, which an operator holds and a client's
 * ordinary administrator should not.
 */
@Controller({ path: "system", version: "1" })
export class QueueController {
  constructor(
    private readonly jobs: JobService,
    private readonly queues: QueueService,
    private readonly monitor: QueueMonitorService,
  ) {}

  @Get("queues")
  @RequirePermission("system.queue.view")
  live() {
    return this.monitor.live();
  }

  @Get("queues/summary")
  @RequirePermission("system.queue.view")
  summary() {
    return this.monitor.summary();
  }

  @Post("queues/:name/pause")
  @RequirePermission("system.queue.manage")
  pause(@Param("name") name: string) {
    return this.monitor.pause(name);
  }

  @Post("queues/:name/resume")
  @RequirePermission("system.queue.manage")
  resume(@Param("name") name: string) {
    return this.monitor.resume(name);
  }

  @Post("queues/:name/clean")
  @RequirePermission("system.queue.manage")
  clean(@Param("name") name: string, @Body() body: unknown) {
    const input = parseOrThrow(cleanSchema, body);
    return this.monitor.clean(name, input.state, input.olderThanMinutes);
  }

  @Get("jobs")
  @RequirePermission("system.queue.view")
  list(@Query() query: Record<string, string>) {
    return this.jobs.list({
      ...readPageRequest(query),
      status: query["status"],
      queue: query["queue"],
      name: query["name"],
      scheduleId: query["scheduleId"],
      from: query["from"],
      to: query["to"],
      search: query["search"],
    });
  }

  @Get("jobs/:id")
  @RequirePermission("system.queue.view")
  async byId(@Param("id", ParseUUIDPipe) id: string) {
    const row = await this.jobs.byId(id);
    if (!row) throw new NotFoundException("Job not found.");
    return row;
  }

  @Post("jobs")
  @RequirePermission("system.queue.manage")
  enqueue(@Body() body: unknown) {
    const input = parseOrThrow(enqueueSchema, body);

    return this.queues.enqueue(input.name, input.payload as Record<string, unknown>, {
      queue: input.queue,
    });
  }

  @Post("jobs/:id/retry")
  @RequirePermission("system.queue.manage")
  retry(@Param("id", ParseUUIDPipe) id: string) {
    // Re-queued as a new job rather than resurrecting the old one, so the
    // history keeps both attempts and the reason the first failed.
    return this.jobs.retry(id);
  }

  @Post("jobs/:id/cancel")
  @RequirePermission("system.queue.manage")
  cancel(@Param("id", ParseUUIDPipe) id: string) {
    return this.jobs.cancel(id);
  }
}
