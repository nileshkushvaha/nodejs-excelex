import { FormSkeleton, PageHeadingSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeadingSkeleton />
      <FormSkeleton fields={4} />
    </div>
  );
}
