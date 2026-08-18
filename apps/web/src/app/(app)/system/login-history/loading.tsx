import { ListSkeleton, PageHeadingSkeleton } from "@/components/skeleton";

/**
 * Shown while the login history is in flight: the tile strip, then the
 * filter bar and table, in the same places the real screen puts them.
 */
export default function Loading() {
  return (
    <div className="animate-fade-up">
      <PageHeadingSkeleton />
      <ListSkeleton columns={6} rows={1} />
      <div className="mt-6">
        <ListSkeleton columns={6} rows={8} />
      </div>
    </div>
  );
}
