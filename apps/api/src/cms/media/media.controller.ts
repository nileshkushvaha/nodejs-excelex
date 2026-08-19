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
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";

import { RequirePermission } from "../../auth/auth.guard";
import { ValidationError } from "../../core/errors/app-error";
import { parseOrThrow } from "../../core/errors/validation";
import { readPageRequest } from "../../masters/paged";
import { MediaService } from "./media.service";

/**
 * The media library's admin API.
 *
 * Uploads are multipart, held in memory (multer's default when no storage is
 * named, so the package need not be a direct dependency): files are capped at UPLOAD_MAX_MB
 * and are checked and measured as a buffer before anything touches storage,
 * so a temp file on disk would only be a second copy. The cap is read from
 * the process environment because an interceptor's options are decided at
 * class-definition time, before Nest has built the ENVIRONMENT provider;
 * the same default the environment schema uses keeps the two in agreement.
 */
const uploadMaxBytes = (Number(process.env["UPLOAD_MAX_MB"]) || 25) * 1024 * 1024;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep that under ${max} characters.`)
    .optional()
    .nullable();

const uploadFieldsSchema = z.object({
  title: optionalText(200),
  altText: optionalText(500),
  caption: optionalText(1000),
  folder: optionalText(100),
});

const patchSchema = uploadFieldsSchema;

@Controller({ path: "cms/media", version: "1" })
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @RequirePermission("cms.media.manage")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: uploadMaxBytes, files: 1 } }))
  async upload(@UploadedFile() file: Express.Multer.File | undefined, @Body() body: Record<string, string>) {
    if (!file) {
      throw new ValidationError([{ path: "file", message: "Choose a file to upload." }]);
    }
    const fields = parseOrThrow(uploadFieldsSchema, body ?? {});
    return this.media.upload({
      originalName: file.originalname,
      mimeType: file.mimetype,
      bytes: file.buffer,
      ...fields,
    });
  }

  @Get()
  @RequirePermission("cms.media.view")
  list(@Query() query: Record<string, string>) {
    return this.media.list({
      ...readPageRequest(query),
      search: query["search"]?.trim() || undefined,
      mimeType: query["mimeType"]?.trim() || undefined,
      folder: query["folder"]?.trim() || undefined,
      includeDeleted: query["includeDeleted"] === "true",
    });
  }

  @Get("folders")
  @RequirePermission("cms.media.view")
  folders() {
    return this.media.folders();
  }

  @Get(":id")
  @RequirePermission("cms.media.view")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.media.get(id);
  }

  @Put(":id")
  @RequirePermission("cms.media.manage")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.media.update(id, parseOrThrow(patchSchema, body));
  }

  @Delete(":id")
  @RequirePermission("cms.media.manage")
  @HttpCode(204)
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.media.remove(id);
  }

  @Delete(":id/permanent")
  @RequirePermission("cms.media.manage")
  @HttpCode(204)
  async removePermanently(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.media.removePermanently(id);
  }
}
