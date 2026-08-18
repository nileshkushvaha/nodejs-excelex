import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";

/**
 * One error shape for every failure, and one rule about detail.
 *
 * In development the response carries the message and the stack, because the
 * person reading it is the person who wrote the bug. In production it carries
 * a status, a sentence, and a reference — nothing that describes the inside
 * of the system.
 *
 * That distinction matters most for the errors nobody threw deliberately. A
 * Prisma error mentions table and column names; a driver error mentions the
 * host it failed to reach. Both are useful in a terminal and both are
 * reconnaissance in a response body.
 *
 * Deliberate HttpExceptions keep their message in production, because they
 * were written to be read: "Domestic is used by 7 product(s)" is the answer,
 * not a leak.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Http");
  private readonly development = process.env.NODE_ENV !== "production";

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // The reference ties this response to the log line that has the detail.
    // Without it, "something broke" is unanswerable by support.
    const reference = randomUUID();

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status} [${reference}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} → ${status} [${reference}]`);
    }

    const body: Record<string, unknown> = {
      statusCode: status,
      reference,
      message: this.message(exception, status),
    };

    if (this.development && !(exception instanceof HttpException)) {
      body["exception"] = exception instanceof Error ? exception.name : typeof exception;
      body["stack"] = exception instanceof Error ? exception.stack : undefined;
    }

    response.status(status).json(body);
  }

  private message(exception: unknown, status: number): string | string[] {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (typeof payload === "string") return payload;

      const message = (payload as { message?: string | string[] }).message;
      if (message) return message;
      return exception.message;
    }

    if (this.development) {
      return exception instanceof Error ? exception.message : String(exception);
    }

    // Production, and nobody meant to throw this. One sentence, no internals.
    return status >= 500
      ? "Something went wrong on our side. The error has been recorded."
      : "That request could not be completed.";
  }
}
