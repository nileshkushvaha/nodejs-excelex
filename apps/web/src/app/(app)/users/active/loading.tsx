import { ListSkeleton, PageHeadingSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeadingSkeleton />
      <ListSkeleton columns={6} rows={8} />
    </div>
  );
}
