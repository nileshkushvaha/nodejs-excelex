import { ListSkeleton, PageHeadingSkeleton } from "@/components/skeleton";

/**
 * Shown while this screen's data is in flight.
 *
 * Next renders it immediately and swaps it for the page when the awaits
 * resolve, which turns a blank navigation into one that shows its shape at
 * once. The layout matches the real screen so nothing jumps on arrival.
 */
export default function Loading() {
  return (
    <div className="animate-fade-up">
      <PageHeadingSkeleton />
      <ListSkeleton />
    </div>
  );
}
