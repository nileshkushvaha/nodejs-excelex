/**
 * What an upload must be before it is kept.
 *
 * The browser's declared content-type is a claim, not a fact: a renamed
 * executable arrives as "image/png" if the person renamed it to .png. So the
 * declared type is checked against a short allow-list first, and then the
 * bytes are asked to agree — every raster format opens with a fixed
 * signature, an SVG must parse to an <svg> element, a PDF starts with
 * "%PDF". A file whose bytes and label disagree is refused with a code the
 * UI can act on, rather than stored and served to every visitor of the site.
 *
 * SVG gets a second look because it is a document, not a picture: it can
 * carry script, event handlers and foreign objects. Rather than trying to
 * sanitise it (and serve a file that differs from what was uploaded), one
 * that carries any of those is refused; a designer's export never does.
 */
import { HttpStatus } from "@nestjs/common";

import { AppError } from "../../core/errors/app-error";

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
  "application/pdf",
  "video/mp4",
  "audio/mpeg",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export class UnsupportedFileError extends AppError {
  constructor(message: string, code: "unsupported_type" | "content_mismatch" | "unsafe_svg") {
    super(HttpStatus.BAD_REQUEST, code, message);
  }
}

const startsWith = (bytes: Buffer, signature: number[], offset = 0): boolean =>
  bytes.length >= offset + signature.length && signature.every((byte, index) => bytes[offset + index] === byte);

const SNIFFERS: Record<AllowedMimeType, (bytes: Buffer) => boolean> = {
  "image/jpeg": (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  "image/png": (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/gif": (b) => b.subarray(0, 6).toString("latin1") === "GIF87a" || b.subarray(0, 6).toString("latin1") === "GIF89a",
  // RIFF....WEBP
  "image/webp": (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  // ISO BMFF: size, then "ftyp", then a brand starting "avif"/"avis".
  "image/avif": (b) => b.subarray(4, 8).toString("latin1") === "ftyp" && /^avi[fs]/u.test(b.subarray(8, 12).toString("latin1")),
  "image/svg+xml": (b) => /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/iu.test(b.subarray(0, 4096).toString("utf8")),
  "application/pdf": (b) => b.subarray(0, 5).toString("latin1") === "%PDF-",
  "video/mp4": (b) => b.subarray(4, 8).toString("latin1") === "ftyp",
  // An MP3 either carries an ID3 tag or begins with a frame sync.
  "audio/mpeg": (b) => b.subarray(0, 3).toString("latin1") === "ID3" || (b.length > 1 && b[0] === 0xff && (b[1]! & 0xe0) === 0xe0),
};

const UNSAFE_SVG = /<script|\son[a-z]+\s*=|javascript:|<foreignobject|<iframe|<embed|<object/iu;

export function isAllowedMimeType(mimeType: string): mimeType is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

/** Refuses a file whose type is not allowed or whose bytes do not match the type. */
export function checkUpload(mimeType: string, bytes: Buffer): AllowedMimeType {
  const declared = mimeType.split(";")[0]!.trim().toLowerCase();
  if (!isAllowedMimeType(declared)) {
    throw new UnsupportedFileError(
      "That kind of file is not accepted. Upload an image (JPEG, PNG, GIF, WebP, AVIF, SVG), a PDF, an MP4 video or an MP3.",
      "unsupported_type",
    );
  }
  if (bytes.length === 0 || !SNIFFERS[declared](bytes)) {
    throw new UnsupportedFileError(
      `The file's contents do not look like ${declared}. It may be corrupt or mislabelled.`,
      "content_mismatch",
    );
  }
  if (declared === "image/svg+xml" && UNSAFE_SVG.test(bytes.toString("utf8"))) {
    throw new UnsupportedFileError(
      "That SVG contains script or event handlers and cannot be published. Export it again without interactivity.",
      "unsafe_svg",
    );
  }
  return declared;
}
