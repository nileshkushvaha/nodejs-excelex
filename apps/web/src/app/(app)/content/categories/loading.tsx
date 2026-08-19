import { ListSkeleton, PageHeadingSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeadingSkeleton />
      <ListSkeleton columns={5} />
    </div>
  );
}
