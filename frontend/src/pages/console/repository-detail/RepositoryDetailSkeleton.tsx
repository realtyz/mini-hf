import { Skeleton } from '@/components/ui/skeleton'

export function RepositoryDetailSkeleton() {
  return (
    <div className="container mx-auto flex flex-1 flex-col px-4 py-8 max-w-5xl">
      {/* Back link */}
      <Skeleton className="h-4 w-32 mb-8" />

      {/* Identity block */}
      <div className="flex items-start gap-4 mb-10">
        <Skeleton className="size-14 rounded-2xl shrink-0" />
        <div className="min-w-0 flex-1 pt-0.5">
          <Skeleton className="h-7 w-72 mb-3" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-12 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        </div>
      </div>

      {/* Metrics bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 rounded-2xl border overflow-hidden mb-10">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2 px-4 py-6">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-14" />
          </div>
        ))}
      </div>

      {/* Snapshot list placeholder */}
      <div className="space-y-1">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    </div>
  )
}
