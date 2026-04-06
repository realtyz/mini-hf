import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { motion } from 'framer-motion'

interface RepoCardSkeletonProps {
  index?: number
}

export function RepoCardSkeleton({ index = 0 }: RepoCardSkeletonProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.05,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <Card className="h-full flex flex-col overflow-hidden relative">
        {/* Top status bar skeleton */}
        <Skeleton className="absolute top-0 left-0 right-0 h-0.5 rounded-none" />

        <CardHeader className="pb-3 pt-5">
          <div className="flex items-start justify-between gap-3">
            {/* Type icon skeleton */}
            <Skeleton className="size-9 rounded-lg shrink-0" />

            <div className="flex-1 min-w-0">
              <Skeleton className="h-5 w-full max-w-48" />
            </div>

            {/* Arrow skeleton */}
            <Skeleton className="size-4 rounded shrink-0" />
          </div>

          {/* Status badges skeleton */}
          <div className="mt-3 flex items-center gap-2">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </CardHeader>

        <CardContent className="pt-0 mt-auto pb-5">
          {/* Stats skeleton */}
          <div className="flex items-center gap-4">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-16" />
          </div>

          {/* Time info skeleton */}
          <div className="mt-3 pt-3 border-t border-border/30 space-y-2">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-3 w-28" />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
