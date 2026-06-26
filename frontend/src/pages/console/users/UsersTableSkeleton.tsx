import { Skeleton } from "@/components/ui/skeleton";

export function UsersTableSkeleton() {
  return (
    <div className="space-y-6">
      {/* Search bar skeleton */}
      <div className="rounded-2xl border border-border/40 bg-card p-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 flex-1 max-w-sm" />
          <Skeleton className="h-4 w-20 ml-auto" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
        <div className="px-5 py-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 py-3.5 border-b border-border/30 last:border-0"
            >
              <Skeleton className="h-4 w-8" />
              <Skeleton className="size-9 rounded-full shrink-0" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-5 w-14 rounded-lg" />
              <Skeleton className="h-5 w-10 rounded-lg" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="size-7 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
