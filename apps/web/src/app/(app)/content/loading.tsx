import { PageHeadingSkeleton, Skeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeadingSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
