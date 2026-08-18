import { ListSkeleton, PageHeadingSkeleton } from "@/components/skeleton";

/** Status card, then the table — the same shape as the loaded screen. */
export default function Loading() {
  return (
    <div className="animate-fade-up">
      <PageHeadingSkeleton />
      <ListSkeleton columns={4} rows={1} />
      <div className="mt-6">
        <ListSkeleton columns={8} rows={6} />
      </div>
    </div>
  );
}
