import { ListSkeleton, PageHeadingSkeleton } from "@/components/skeleton";

/**
 * Shown while the trail is in flight. Same shape as the real screen — a strip
 * of tiles, then a filter bar and a table — so nothing jumps on arrival.
 */
export default function Loading() {
  return (
    <div className="animate-fade-up">
      <PageHeadingSkeleton />
      <ListSkeleton columns={4} rows={1} />
      <div className="mt-6">
        <ListSkeleton columns={6} rows={8} />
      </div>
    </div>
  );
}
