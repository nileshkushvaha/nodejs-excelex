import { FormSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="animate-fade-up">
      <FormSkeleton />
    </div>
  );
}
