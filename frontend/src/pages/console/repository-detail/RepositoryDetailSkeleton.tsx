import { Skeleton } from '@/components/ui/skeleton'

export function RepositoryDetailSkeleton() {
  return (
    <div className="container mx-auto flex flex-1 flex-col px-4 py-10 max-w-5xl">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2">
        <Skeleton className="h-3 w-8" />
        <span className="text-muted-foreground/30">/</span>
        <Skeleton className="h-3 w-20" />
        <span className="text-muted-foreground/30">/</span>
        <Skeleton className="h-3 w-32" />
      </div>

      {/* Manifest sheet */}
      <div className="rounded-2xl border border-border/60 bg-card px-6 py-10 sm:px-10 sm:py-12">
        {/* Identity hero */}
        <div className="mb-14">
          <Skeleton className="h-9 w-[60%] mb-5" />
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-16" />
          </div>
        </div>

        {/* Metric strip */}
        <div className="mb-16 grid grid-cols-2 sm:grid-cols-4 border-y border-border/60 divide-x divide-border/60">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={i >= 2 ? 'flex flex-col gap-3 px-5 py-5 border-t sm:border-t-0 border-border/60' : 'flex flex-col gap-3 px-5 py-5'}
            >
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-6 w-20" />
            </div>
          ))}
        </div>

        {/* Snapshot section */}
        <div>
          <div className="mb-4 flex items-baseline justify-between">
            <Skeleton className="h-2.5 w-10" />
            <Skeleton className="h-3 w-10" />
          </div>
          <div className="border-y border-border/60">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className={i < 2 ? 'flex items-center gap-5 px-2 py-4 border-b border-border/60' : 'flex items-center gap-5 px-2 py-4'}
              >
                <Skeleton className="size-3.5 rounded-sm shrink-0" />
                <div className="flex-1 flex flex-col gap-2">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-2.5 w-48" />
                </div>
                <Skeleton className="hidden md:block h-0.75 w-24 rounded-full" />
                <Skeleton className="hidden md:block h-3 w-28" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
