import { Controller, Get, Inject, Req, Res, StreamableFile } from "@nestjs/common";
import type { Request, Response } from "express";

import { PublicRoute } from "../../auth/auth.guard";
import { ENVIRONMENT, type Environment } from "../../core/config/environment";
import { NotFoundError } from "../../core/errors/app-error";
import { StorageService } from "../../core/storage/storage.service";
import { MediaService } from "./media.service";

/**
 * Serves uploaded files to anyone.
 *
 * The URL is the storage key, and the key's first segment is the client the
 * file belongs to — the row is looked up under that client, so the host the
 * request arrived on plays no part and a file cannot be served under a
 * different client's row. Only the local driver streams from here; with S3
 * the URL the library hands out already points at the bucket, and a request
 * that reaches this route anyway is sent there.
 *
 * Keys are content-addressed enough (a random segment per upload) that the
 * response can be cached for a year and marked immutable: a replaced image
 * is a new key, never the same one with different bytes.
 */
@Controller({ path: "public", version: "1" })
export class PublicMediaController {
  constructor(
    private readonly media: MediaService,
    private readonly storage: StorageService,
    @Inject(ENVIRONMENT) private readonly environment: Environment,
  ) {}

  @Get("media/*key")
  @PublicRoute()
  async serve(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<StreamableFile | void> {
    // Express 5 hands a wildcard as an array of segments.
    const raw = (request.params as Record<string, string | string[]>)["key"];
    const key = Array.isArray(raw) ? raw.join("/") : (raw ?? "");
    if (!key || key.includes("..")) throw new NotFoundError("That file");

    const row = await this.media.findByKey(key);
    if (!row) throw new NotFoundError("That file");

    if (this.environment.STORAGE_DRIVER === "s3") {
      response.redirect(302, this.storage.url(key));
      return;
    }

    let stored: Awaited<ReturnType<StorageService["stream"]>>;
    try {
      stored = await this.storage.stream(key);
    } catch {
      stored = null;
    }
    if (!stored) throw new NotFoundError("That file");

    response.setHeader("Content-Type", row.mimeType);
    response.setHeader("Content-Length", String(stored.sizeBytes));
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    response.setHeader("X-Content-Type-Options", "nosniff");
    // Inline for what a browser renders, an attachment for the rest — a PDF
    // opens in the tab, a video plays, an audio file plays.
    response.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
    );
    return new StreamableFile(stored.stream);
  }
}
