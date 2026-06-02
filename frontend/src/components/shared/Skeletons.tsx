import { Skeleton } from "../ui/skeleton";

// Stand-in for the dashboard's metric strip + monitors + recent activity while
// the first fetch is in flight, so the page never flashes the "No monitors yet"
// empty state or a row of 0/0/0/0 metrics before real data lands.
export function DashboardSkeleton() {
  return (
    <output className="block space-y-6" aria-label="Loading dashboard">
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-28 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-40 w-full" />
      </div>
    </output>
  );
}

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
    <output className="grid gap-5 md:grid-cols-2" aria-label="Loading form">
      <Skeleton className="h-16 md:col-span-2" />
      <Skeleton className="h-16 md:col-span-2" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
      <Skeleton className="h-24 md:col-span-2" />
    </output>
  );
}
