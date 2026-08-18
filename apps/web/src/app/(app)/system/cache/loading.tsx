import { ListSkeleton, PageHeadingSkeleton } from "@/components/skeleton";

/**
 * Shown while this screen's data is in flight. The layout matches the real
 * screen so nothing jumps on arrival.
 */
export default function Loading() {
  return (
    <div className="animate-fade-up">
      <PageHeadingSkeleton />
      <ListSkeleton columns={4} rows={2} />
      <div className="mt-6">
        <ListSkeleton columns={7} rows={5} />
      </div>
    </div>
  );
}
