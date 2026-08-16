import type { IconName } from "@/lib/navigation";

/**
 * Inline SVG rather than an icon package: nine icons do not justify a dependency,
 * and inlining keeps them theme-aware through currentColor with no runtime cost.
 */
const PATHS: Record<IconName, string> = {
  dashboard: "M3 3h7v9H3V3zm0 11h7v7H3v-7zm9 0h9v7h-9v-7zm0-11h9v9h-9V3z",
  shipment: "M3 7l9-4 9 4v10l-9 4-9-4V7zm9-1.8L5.6 8 12 10.8 18.4 8 12 5.2zM5 9.6V16l6 2.7v-6.4L5 9.6zm8 8.7l6-2.7V9.6l-6 2.7v6z",
  manifest: "M6 2h9l5 5v15H6V2zm8 1.5V8h4.5L14 3.5zM8 11h8v1.6H8V11zm0 4h8v1.6H8V15z",
  tracking: "M12 2a7 7 0 017 7c0 5-7 13-7 13S5 14 5 9a7 7 0 017-7zm0 4.4A2.6 2.6 0 1012 11.6 2.6 2.6 0 0012 6.4z",
  customer: "M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5c0-3-4-5.5-9-5.5z",
  branch: "M4 21V7l8-5 8 5v14h-6v-6h-4v6H4zm4-9h3V9H8v3zm5 0h3V9h-3v3z",
  user: "M12 12a4.5 4.5 0 100-9 4.5 4.5 0 000 9zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5z",
  role: "M12 2l8 3.5v5.8c0 5-3.4 9.6-8 10.7-4.6-1.1-8-5.7-8-10.7V5.5L12 2zm-1 13.4l5.3-5.3-1.4-1.4-3.9 3.9-1.9-1.9-1.4 1.4 3.3 3.3z",
  invoice: "M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2V2zm3 5h8v1.7H8V7zm0 4h8v1.7H8V11zm0 4h5v1.7H8V15z",
  report: "M4 3h16v18H4V3zm3 5h10v1.7H7V8zm0 4h10v1.7H7V12zm0 4h6v1.7H7V16z",
  vendor: "M3 8l2-4h14l2 4v2h-1v10H4V10H3V8zm3 4v6h12v-6H6zm1-6l-1 2h12l-1-2H7z",
  rate: "M12 2l2.6 6.3 6.8.5-5.2 4.4 1.6 6.6L12 16.3 6.2 19.8l1.6-6.6L2.6 8.8l6.8-.5L12 2z",
  import: "M12 2v9.2l3.6-3.6 1.4 1.4-6 6-6-6 1.4-1.4L10 11.2V2h2zM4 18h16v2H4v-2z",
  settings:
    "M12 8a4 4 0 100 8 4 4 0 000-8zm9.4 4a7.6 7.6 0 01-.1 1.2l2 1.6-1.9 3.3-2.4-1a7.6 7.6 0 01-2 1.2l-.4 2.6h-3.9l-.4-2.6a7.6 7.6 0 01-2-1.2l-2.4 1L2 14.8l2-1.6a7.6 7.6 0 010-2.4L2 9.2l1.9-3.3 2.4 1a7.6 7.6 0 012-1.2l.4-2.6h3.9l.4 2.6c.7.3 1.4.7 2 1.2l2.4-1L21.4 9l-2 1.6c.1.4.1.8.1 1.2z",
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className ?? "h-4 w-4"}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
