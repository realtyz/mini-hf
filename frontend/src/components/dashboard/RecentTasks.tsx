import {
  IconArrowRight,
  IconDatabase,
  IconCloudDownload,
} from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useRecentTasks } from '@/hooks/api/use-dashboard-queries'
import { useTaskProgress } from '@/hooks/api/use-task-progress'
import type { TaskResponse } from '@/lib/api-types'
import type { TaskStatus } from '@/types/task'
import { formatBytes, formatDistanceToNow, cn } from '@/lib/utils'
import { TASK_STATUS_CONFIG } from '@/lib/constants/task'
import { Link } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'

const statusConfig = TASK_STATUS_CONFIG

// 进度显示组件
function TaskProgress({ taskId, status }: { taskId: number; status: TaskStatus }) {
  const { data: progress } = useTaskProgress(taskId, status)
  const config = statusConfig[status]

  if (status === 'completed') {
    return (
      <div className="flex items-center gap-2">
        <div className={cn('h-1.5 w-20 overflow-hidden rounded-full', config.progressBg)}>
          <div className={cn('h-full w-full rounded-full', config.progressFill)} />
        </div>
        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">100%</span>
      </div>
    )
  }

  if (status !== 'running' || !progress) {
    return <span className="text-xs text-muted-foreground">-</span>
  }

  return (
    <div className="flex items-center gap-2">
      <div className={cn('h-1.5 w-20 overflow-hidden rounded-full', config.progressBg)}>
        <motion.div
          className={cn('h-full rounded-full', config.progressFill)}
          initial={{ width: 0 }}
          animate={{ width: `${progress.progress_percent}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{progress.progress_percent}%</span>
    </div>
  )
}

// 单个任务项
function TaskItem({ task, index }: { task: TaskResponse; index: number }) {
  const status = statusConfig[task.status]

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="group relative"
    >
      {/* 背景渐变层 */}
      <div className={cn(
        'absolute inset-0 rounded-xl bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-300',
        status.gradient
      )} />

      <div className="relative flex items-center gap-4 p-4 rounded-xl border bg-card/50 backdrop-blur-sm group-hover:border-primary/20 group-hover:bg-card/80 transition-all duration-200 cursor-pointer">
        {/* Status indicator dot with pulse */}
        <div className="relative shrink-0">
          <div className={cn('h-2.5 w-2.5 rounded-full', status.dotClass)} />
          {task.status === 'running' && (
            <>
              <div className={cn('absolute inset-0 h-2.5 w-2.5 rounded-full animate-ping opacity-40', status.dotClass)} />
              <div className={cn('absolute inset-0 h-2.5 w-2.5 rounded-full animate-pulse opacity-20', status.dotClass)} />
            </>
          )}
        </div>

        {/* 任务信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate text-sm group-hover:text-foreground transition-colors">{task.repo_id}</span>
            <Badge
              className={cn('text-[11px] shrink-0 gap-1 font-medium px-2 py-0.5 border-0', status.badgeClass)}
            >
              {status.icon}
              {status.label}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <IconDatabase className="size-3" />
              {task.repo_type === 'model' ? '模型' : '数据集'}
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span className="flex items-center gap-1">
              <IconCloudDownload className="size-3" />
              {formatBytes(task.total_storage || 0)}
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span>{formatDistanceToNow(new Date(task.created_at))}</span>
          </div>
        </div>

        {/* 进度 */}
        <div className="hidden sm:block shrink-0">
          <TaskProgress taskId={task.id} status={task.status} />
        </div>

        {/* Hover 箭头指示 */}
        <IconArrowRight className="size-4 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-all duration-200 shrink-0" />
      </div>
    </motion.div>
  )
}

// 加载状态
function TaskListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="flex items-center gap-4 p-4 rounded-xl border bg-card/50"
        >
          <Skeleton className="h-2.5 w-2.5 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-4 w-20 hidden sm:block" />
        </motion.div>
      ))}
    </div>
  )
}

// 空状态
function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center py-12"
    >
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800/50 dark:to-slate-900/50 mb-4 shadow-sm">
        <IconCloudDownload className="size-6 text-slate-400 dark:text-slate-500" />
      </div>
      <p className="text-muted-foreground font-medium">暂无任务记录</p>
      <p className="text-xs text-muted-foreground/60 mt-1">新创建的任务将显示在这里</p>
    </motion.div>
  )
}

// 主组件
export function RecentTasks() {
  const { data: tasksData, isLoading } = useRecentTasks(10)
  const tasks = tasksData?.data || []

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card className="border transition-all duration-300 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20 overflow-hidden">
        {/* 顶部渐变装饰线 */}
        <div className="h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div className="space-y-1.5">
            <CardTitle className="text-base font-semibold tracking-tight">最近任务</CardTitle>
            <p className="text-xs text-muted-foreground">
              显示最近30天内的任务记录
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 group/btn hover:bg-primary/5 hover:text-primary transition-colors"
            asChild
          >
            <Link to="/console/tasks">
              查看全部
              <IconArrowRight className="size-4 transition-transform group-hover/btn:translate-x-0.5" />
            </Link>
          </Button>
        </CardHeader>

        <CardContent className="pt-0">
          {isLoading ? (
            <TaskListSkeleton />
          ) : tasks.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {tasks.map((task: TaskResponse, index: number) => (
                  <TaskItem key={task.id} task={task} index={index} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

export default RecentTasks
