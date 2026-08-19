import { Injectable } from "@nestjs/common";
import sharp from "sharp";

import { requireRequestContext } from "../../core/context/request-context";
import { PrismaService } from "../../core/database/prisma.service";
import { NotFoundError } from "../../core/errors/app-error";
import { StorageService } from "../../core/storage/storage.service";
import { paginate, type PageRequest } from "../../masters/paged";
import { checkUpload } from "./file-check";

/**
 * The media library: what was uploaded, by whom, and where it lives.
 *
 * The row is the record and the storage object is the bytes; the two are
 * kept deliberately loose. Deleting a picture from the library is a soft
 * delete — the row is hidden, the public route stops serving it, but the
 * bytes stay — so a mistake is a row flip away from being undone by someone
 * with database access, and nothing is lost until "delete permanently",
 * which is a separate and more deliberate action that removes the object.
 *
 * Bytes are checked before storage (see file-check.ts) and measured with
 * sharp for raster images so the editor can write width/height into <img>
 * and the public site avoids layout shift. SVG is not measured: its size is
 * whatever the viewBox says, and sharp would rasterise it to find out.
 *
 * `uploadedBy` is not a Prisma relation — media outlives people — so names
 * are looked up per page rather than joined.
 */
type ClientTx = Parameters<Parameters<PrismaService["forClient"]>[1]>[0];

export interface MediaListQuery extends PageRequest {
  search?: string;
  mimeType?: string;
  folder?: string;
  includeDeleted?: boolean;
}

export interface MediaRow {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  title: string | null;
  caption: string | null;
  folder: string | null;
  uploadedBy: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface MediaRecord {
  id: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  altText: string | null;
  title: string | null;
  caption: string | null;
  folder: string | null;
  uploadedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface UploadInput {
  originalName: string;
  mimeType: string;
  bytes: Buffer;
  title?: string | null;
  altText?: string | null;
  caption?: string | null;
  folder?: string | null;
}

export interface MediaPatch {
  title?: string | null;
  altText?: string | null;
  caption?: string | null;
  folder?: string | null;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload(input: UploadInput): Promise<MediaRow> {
    const { clientId, actor, ip, userAgent } = requireRequestContext();
    const mimeType = checkUpload(input.mimeType, input.bytes);

    let width: number | null = null;
    let height: number | null = null;
    if (mimeType.startsWith("image/") && mimeType !== "image/svg+xml") {
      try {
        const meta = await sharp(input.bytes).metadata();
        width = meta.width ?? null;
        height = meta.height ?? null;
      } catch {
        // Passed the signature check but sharp cannot read it: keep the file,
        // just without dimensions. A truncated JPEG still displays.
      }
    }

    const key = this.storage.keyFor(clientId!, input.originalName);
    const stored = await this.storage.put(key, input.bytes, mimeType);

    return this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.cmsMedia.create({
        data: {
          clientId: clientId!,
          storageKey: stored.key,
          fileName: input.originalName,
          mimeType,
          sizeBytes: stored.sizeBytes,
          width,
          height,
          checksum: stored.checksum,
          title: input.title || null,
          altText: input.altText || null,
          caption: input.caption || null,
          folder: input.folder || null,
          uploadedById: actor?.userId ?? null,
        },
      });
      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "cms.media.uploaded",
          entity: "cms_media",
          entityId: row.id,
          metadata: { fileName: row.fileName, mimeType, sizeBytes: row.sizeBytes },
          ip: ip ?? null,
          userAgent: userAgent ?? null,
        },
      });
      const names = await this.namesFor(tx, [row.uploadedById]);
      return this.toRow(row, names);
    });
  }

  async list(query: MediaListQuery) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      const page = await paginate(
        tx.cmsMedia,
        {
          where: {
            ...(query.includeDeleted ? {} : { deletedAt: null }),
            ...(query.mimeType ? { mimeType: { startsWith: query.mimeType } } : {}),
            ...(query.folder ? { folder: query.folder } : {}),
            ...(query.search
              ? {
                  OR: [
                    { fileName: { contains: query.search, mode: "insensitive" } },
                    { title: { contains: query.search, mode: "insensitive" } },
                    { altText: { contains: query.search, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          orderBy: { createdAt: "desc" },
          request: query,
        },
        (row: MediaRecord) => row,
      );
      const names = await this.namesFor(tx, page.rows.map((row) => row.uploadedById));
      return { ...page, rows: page.rows.map((row) => this.toRow(row, names)) };
    });
  }

  async folders(): Promise<Array<{ folder: string; count: number }>> {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      const groups = await tx.cmsMedia.groupBy({
        by: ["folder"],
        where: { deletedAt: null, folder: { not: null } },
        _count: { _all: true },
        orderBy: { folder: "asc" },
      });
      return groups.map((group) => ({ folder: group.folder!, count: group._count._all }));
    });
  }

  async get(id: string): Promise<MediaRow> {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.cmsMedia.findFirst({ where: { id } });
      if (!row) throw new NotFoundError("That file");
      return this.toRow(row, await this.namesFor(tx, [row.uploadedById]));
    });
  }

  async update(id: string, patch: MediaPatch): Promise<MediaRow> {
    const { clientId, actor, ip, userAgent } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      const existing = await tx.cmsMedia.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundError("That file");
      const row = await tx.cmsMedia.update({
        where: { id },
        data: {
          ...(patch.title !== undefined ? { title: patch.title || null } : {}),
          ...(patch.altText !== undefined ? { altText: patch.altText || null } : {}),
          ...(patch.caption !== undefined ? { caption: patch.caption || null } : {}),
          ...(patch.folder !== undefined ? { folder: patch.folder || null } : {}),
        },
      });
      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "cms.media.updated",
          entity: "cms_media",
          entityId: id,
          metadata: patch as Record<string, string | null>,
          ip: ip ?? null,
          userAgent: userAgent ?? null,
        },
      });
      return this.toRow(row, await this.namesFor(tx, [row.uploadedById]));
    });
  }

  /** Hides the file from the library and the public route; the bytes stay until a permanent delete. */
  async remove(id: string): Promise<void> {
    const { clientId, actor, ip, userAgent } = requireRequestContext();
    await this.prisma.forClient(clientId!, async (tx) => {
      const existing = await tx.cmsMedia.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new NotFoundError("That file");
      await tx.cmsMedia.update({ where: { id }, data: { deletedAt: new Date() } });
      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "cms.media.deleted",
          entity: "cms_media",
          entityId: id,
          metadata: { fileName: existing.fileName },
          ip: ip ?? null,
          userAgent: userAgent ?? null,
        },
      });
    });
  }

  /** Removes the row and the stored object. Anything still embedding the URL will break — the caller chose that. */
  async removePermanently(id: string): Promise<void> {
    const { clientId, actor, ip, userAgent } = requireRequestContext();
    const key = await this.prisma.forClient(clientId!, async (tx) => {
      const existing = await tx.cmsMedia.findFirst({ where: { id } });
      if (!existing) throw new NotFoundError("That file");
      await tx.cmsMedia.delete({ where: { id } });
      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "cms.media.purged",
          entity: "cms_media",
          entityId: id,
          metadata: { fileName: existing.fileName, storageKey: existing.storageKey },
          ip: ip ?? null,
          userAgent: userAgent ?? null,
        },
      });
      return existing.storageKey;
    });
    // After the transaction: a storage failure must not un-delete the row,
    // and an orphaned object is a cost, not a leak.
    await this.storage.delete(key).catch(() => undefined);
  }

  /**
   * For the public route: the row a storage key names, under the client the
   * key's first segment names. Nothing else about the request is trusted.
   */
  async findByKey(key: string): Promise<{ mimeType: string; fileName: string } | null> {
    const clientId = key.split("/")[0]!;
    if (!/^[0-9a-f-]{36}$/u.test(clientId)) return null;
    return this.prisma.forClient(clientId, async (tx) => {
      const row = await tx.cmsMedia.findFirst({ where: { storageKey: key, deletedAt: null }, select: { mimeType: true, fileName: true } });
      return row ?? null;
    });
  }

  private async namesFor(tx: ClientTx, ids: Array<string | null>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map();
    const users = await tx.user.findMany({ where: { id: { in: unique } }, select: { id: true, fullName: true } });
    return new Map(users.map((user) => [user.id, user.fullName]));
  }

  private toRow(row: MediaRecord, names: Map<string, string>): MediaRow {
    return {
      id: row.id,
      url: this.storage.url(row.storageKey),
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      width: row.width,
      height: row.height,
      altText: row.altText,
      title: row.title,
      caption: row.caption,
      folder: row.folder,
      uploadedBy: row.uploadedById ? { id: row.uploadedById, fullName: names.get(row.uploadedById) ?? "Unknown" } : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    };
  }
}
