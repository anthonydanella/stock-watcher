import { Skeleton } from "../ui/skeleton";

export function MonitorListSkeleton() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function EditorSkeleton() {
  return (
    <div className="grid gap-5 md:grid-cols-2" role="status" aria-label="Loading form">
      <Skeleton className="h-16 md:col-span-2" />
      <Skeleton className="h-16 md:col-span-2" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
      <Skeleton className="h-24 md:col-span-2" />
    </div>
  );
}
