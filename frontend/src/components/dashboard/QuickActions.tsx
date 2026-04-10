import { IconLoader, IconPlayerPlay, IconDatabase, IconArrowRight, IconTrendingUp } from '@tabler/icons-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useTaskList } from '@/hooks/useTaskList'
import { useTaskProgress } from '@/hooks/api/use-task-progress'
import type { TaskResponse } from '@/lib/api-types'
import { Link } from 'react-router'
import { cn, formatBytes } from '@/lib/utils'

// 单个运行中任务卡片
function RunningTaskItem({ task, index }: { task: TaskResponse; index: number }) {
  const { data: progress } = useTaskProgress(task.id, task.status)

  const percent = progress?.progress_percent ?? 0
  const speed = progress?.speed_bytes_per_sec
  const currentFile = progress?.current_file

  return (
    <div
      className={cn(
        "group flex flex-col gap-3 p-4 rounded-xl border bg-card/50",
        "transition-all duration-200",
        "hover:bg-card hover:border-primary/20 hover:shadow-md"
      )}
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative">
            <IconLoader className="size-4 animate-spin text-blue-500" />
            <span className="absolute inset-0 animate-pulse-ring rounded-full bg-blue-500/30" />
          </div>
          <span className="font-medium text-sm truncate max-w-35">
            {task.repo_id}
          </span>
        </div>
        <Badge
          variant="outline"
          className="text-xs shrink-0 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800"
        >
          {task.repo_type === 'model' ? '模型' : '数据集'}
        </Badge>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">{percent}%</span>
          <span className="text-muted-foreground">
            {speed ? `${formatBytes(speed)}/s` : '-'}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-linear-to-r from-blue-500 to-blue-400 transition-all duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {currentFile && (
        <p className="text-xs text-muted-foreground truncate">
          {currentFile}
        </p>
      )}
    </div>
  )
}

export function RunningTasks() {
  const { data: runningTasksData, isLoading } = useTaskList({
    status: 'running',
    limit: 5,
  })

  const runningTasks = runningTasksData?.data || []

  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48 mt-1" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn(
      "overflow-hidden transition-all duration-300",
      "hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <IconTrendingUp className="size-4 text-blue-500" />
              进行中的任务
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              当前正在下载或处理的任务
            </CardDescription>
          </div>
          {runningTasks.length > 0 && (
            <Badge
              variant="secondary"
              className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
            >
              {runningTasks.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {runningTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-xl bg-muted/80 p-4 mb-3">
              <IconPlayerPlay className="size-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">暂无进行中的任务</p>
            <Button variant="link" size="sm" asChild className="mt-1">
              <Link to="/console/tasks">查看所有任务</Link>
            </Button>
          </div>
        ) : (
          <>
            {runningTasks.map((task: TaskResponse, index: number) => (
              <RunningTaskItem key={task.id} task={task} index={index} />
            ))}
            {runningTasksData && runningTasksData.total > 5 && (
              <Button variant="ghost" size="sm" className="w-full" asChild>
                <Link to="/console/tasks">
                  查看全部 {runningTasksData.total} 个任务
                  <IconArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// 快捷操作卡片
export function QuickActions() {
  const { data: pendingApprovalData } = useTaskList({
    status: 'pending_approval',
    limit: 1,
  })

  const pendingCount = pendingApprovalData?.total ?? 0

  return (
    <Card className={cn(
      "overflow-hidden transition-all duration-300",
      "hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20"
    )}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">快捷操作</CardTitle>
        <CardDescription className="text-xs mt-1">
          常用功能和待办事项
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button
          className="w-full justify-start gap-2 bg-primary hover:bg-primary/90"
          asChild
        >
          <Link to="/console/tasks">
            <IconDatabase className="size-4" />
            新建下载任务
          </Link>
        </Button>

        {pendingCount > 0 && (
          <Button
            variant="outline"
            className="w-full justify-start gap-2 relative border-amber-200 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-950/30"
            asChild
          >
            <Link to="/console/tasks">
              <IconLoader className="size-4 text-amber-500" />
              待审批任务
              <Badge
                variant="secondary"
                className="ml-auto bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
              >
                {pendingCount}
              </Badge>
            </Link>
          </Button>
        )}

        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          asChild
        >
          <Link to="/console/repositories">
            <IconDatabase className="size-4" />
            浏览仓库
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
