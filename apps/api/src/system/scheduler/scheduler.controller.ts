import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";

import { RequirePermission } from "../../auth/auth.guard";
import { JOB_DESCRIPTIONS, JOB_NAMES, QUEUES } from "../../jobs/job.types";
import { readPageRequest } from "../../masters/paged";
import { SCHEDULE_TIMEZONES, ScheduleService, scheduleInputSchema } from "./schedule.service";
import { SchedulerService, TICK_MS } from "./scheduler.service";
import { parseOrThrow } from "../../core/errors/validation";

/**
 * Schedules and the dispatcher's own state.
 *
 * The schedule routes are ordinary client-scoped CRUD. The status route is
 * about this process — is it the leader, when did it last look — which is
 * the same answer for every client, and is here so an operator can tell
 * "nothing fired" apart from "nothing was due".
 */
@Controller({ path: "system", version: "1" })
export class SchedulerController {
  constructor(
    private readonly schedules: ScheduleService,
    private readonly scheduler: SchedulerService,
  ) {}

  @Get("scheduler/status")
  @RequirePermission("system.schedule.view")
  async status() {
    return {
      enabled: this.scheduler.enabled,
      isLeader: this.scheduler.isLeader,
      lastTickAt: this.scheduler.lastTickAt?.toISOString() ?? null,
      nextTickAt: this.scheduler.nextTickAt?.toISOString() ?? null,
      tickMs: TICK_MS,
      dueCount: await this.scheduler.dueCount(),
    };
  }

  @Get("schedules/options")
  @RequirePermission("system.schedule.view")
  options() {
    return {
      jobNames: Object.values(JOB_NAMES).map((name) => ({ name, description: JOB_DESCRIPTIONS[name] })),
      queues: Object.values(QUEUES),
      timezones: SCHEDULE_TIMEZONES,
    };
  }

  @Get("schedules")
  @RequirePermission("system.schedule.view")
  list(@Query() query: Record<string, string>) {
    return this.schedules.list({
      ...readPageRequest(query),
      isActive: query["isActive"],
      jobName: query["jobName"],
      search: query["search"],
    });
  }

  @Get("schedules/:id")
  @RequirePermission("system.schedule.view")
  byId(@Param("id", ParseUUIDPipe) id: string) {
    return this.schedules.byId(id);
  }

  @Post("schedules")
  @RequirePermission("system.schedule.manage")
  create(@Body() body: unknown) {
    return this.schedules.create(parse(body));
  }

  @Put("schedules/:id")
  @RequirePermission("system.schedule.manage")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.schedules.update(id, parse(body));
  }

  @Delete("schedules/:id")
  @HttpCode(204)
  @RequirePermission("system.schedule.manage")
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.schedules.remove(id);
  }

  @Post("schedules/:id/run")
  @RequirePermission("system.schedule.manage")
  run(@Param("id", ParseUUIDPipe) id: string) {
    return this.schedules.runNow(id);
  }

  @Post("schedules/:id/activate")
  @RequirePermission("system.schedule.manage")
  activate(@Param("id", ParseUUIDPipe) id: string) {
    return this.schedules.setActive(id, true);
  }

  @Post("schedules/:id/deactivate")
  @RequirePermission("system.schedule.manage")
  deactivate(@Param("id", ParseUUIDPipe) id: string) {
    return this.schedules.setActive(id, false);
  }
}

function parse(body: unknown) {
  const input = parseOrThrow(scheduleInputSchema, body);
  return input;
}
