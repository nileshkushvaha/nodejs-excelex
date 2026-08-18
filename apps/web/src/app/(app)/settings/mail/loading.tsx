import { FormSkeleton, ListSkeleton, PageHeadingSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="space-y-8">
      <PageHeadingSkeleton />
      <FormSkeleton fields={6} />
      <ListSkeleton columns={5} rows={4} />
    </div>
  );
}
