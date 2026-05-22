import { Skeleton } from '@/components/ui/skeleton'

export function RepositoryDetailSkeleton() {
  return (
    <div className="container mx-auto flex flex-1 flex-col px-4 py-8">
      <Skeleton className="h-4 w-32 mb-6" />
      <div className="flex items-start gap-3 mb-8">
        <Skeleton className="size-12 rounded-xl shrink-0" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-7 w-64 mb-2" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-19 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  )
}
