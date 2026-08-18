import { ListSkeleton, PageHeadingSkeleton } from "@/components/skeleton";

/**
 * Shown while the first snapshot is in flight. Same shape as the real screen
 * — a strip, a row of tiles, a chart, tables — so nothing jumps on arrival.
 */
export default function Loading() {
  return (
    <div className="animate-fade-up">
      <PageHeadingSkeleton />
      <ListSkeleton columns={4} rows={1} />
      <div className="mt-4">
        <ListSkeleton columns={5} rows={2} />
      </div>
      <div className="mt-6">
        <ListSkeleton columns={7} rows={6} />
      </div>
    </div>
  );
}
