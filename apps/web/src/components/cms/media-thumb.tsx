/**
 * A tile for one media item, wherever a list of media appears.
 *
 * Images show themselves; everything else shows a labelled placeholder with
 * the file's kind, so a PDF and an MP4 are as findable in a grid as a
 * photograph. Kept presentational — selection, drawers and menus are the
 * caller's — so the library page and the picker share one look.
 */
export interface MediaThumbItem {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  altText?: string | null;
  title?: string | null;
  width?: number | null;
  height?: number | null;
}

export function kindOf(mimeType: string): "image" | "video" | "audio" | "pdf" | "file" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf") return "pdf";
  return "file";
}

const KIND_LABEL = { image: "Image", video: "Video", audio: "Audio", pdf: "PDF", file: "File" } as const;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaThumb({
  item,
  selected,
  onClick,
  size = "md",
}: {
  item: MediaThumbItem;
  selected?: boolean;
  onClick?: () => void;
  size?: "sm" | "md";
}) {
  const kind = kindOf(item.mimeType);
  const label = item.title || item.altText || item.fileName;
  const ring = selected ? "ring-2 ring-accent ring-offset-2 ring-offset-surface-1" : "ring-1 ring-line hover:ring-accent";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={label}
      aria-pressed={onClick ? Boolean(selected) : undefined}
      className={`group relative flex aspect-square w-full flex-col overflow-hidden rounded-lg bg-surface-3 text-left transition ${ring} ${onClick ? "cursor-pointer" : ""}`}
    >
      {kind === "image" ? (
        // A plain <img>: the source is our own API and sizes are known, and
        // next/image would need the API host allow-listed for no gain here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.url}
          alt={item.altText ?? ""}
          loading="lazy"
          className="h-full w-full object-cover"
          width={item.width ?? undefined}
          height={item.height ?? undefined}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
          <span className="rounded-md bg-surface-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted ring-1 ring-line">
            {KIND_LABEL[kind]}
          </span>
          <span className={`line-clamp-2 break-all text-fg ${size === "sm" ? "text-[10px]" : "text-xs"}`}>{item.fileName}</span>
        </div>
      )}
      {kind === "image" ? (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-slate-950/70 to-transparent px-2 pb-1.5 pt-4 text-[11px] text-white opacity-0 transition group-hover:opacity-100">
          {item.fileName}
        </span>
      ) : null}
    </Tag>
  );
}
