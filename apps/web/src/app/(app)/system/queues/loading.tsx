import { ListSkeleton, PageHeadingSkeleton } from "@/components/skeleton";

/** Matches the real layout — tiles, summary strip, table — so nothing jumps. */
export default function Loading() {
  return (
    <div className="animate-fade-up">
      <PageHeadingSkeleton />
      <ListSkeleton columns={3} rows={1} />
      <div className="mt-4">
        <ListSkeleton columns={5} rows={3} />
      </div>
      <div className="mt-6">
        <ListSkeleton columns={7} rows={8} />
      </div>
    </div>
  );
}
