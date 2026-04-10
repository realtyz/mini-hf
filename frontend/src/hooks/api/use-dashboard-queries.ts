/**
 * Dashboard 专用数据查询 Hooks
 */
import { useQuery, useQueries } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { useTaskList } from '@/hooks/useTaskList'
import type { TaskResponse, TaskStatus, DashboardStatsResponse, TaskListResponse } from '@/lib/api-types'
import api from '@/lib/api'

/**
 * Dashboard 统计数据
 */
export function useDashboardStats() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.dashboard.stats(),
    queryFn: () => api.get<DashboardStatsResponse>('/hf_repo/dashboard-stats'),
    staleTime: 60 * 1000, // 1 minute
  })

  return {
    stats: {
      totalRepos: data?.data?.total_repos ?? 0,
      totalFiles: data?.data?.total_files ?? 0,
      storageCapacity: data?.data?.storage_capacity ?? 0,
      totalDownloads: data?.data?.total_downloads ?? 0,
    },
    isLoading,
  }
}

/**
 * 任务趋势数据（最近7天）
 */
export interface TaskTrendData {
  date: string
  completed: number
  failed: number
  running: number
  pending: number
}

export function useTaskTrends() {
  const { data, isLoading } = useTaskList({
    hours: 24 * 7,
    limit: 1000,
  })

  const trends: TaskTrendData[] = (() => {
    if (!data?.data) return []

    const tasks = data.data as TaskResponse[]
    const grouped = new Map<string, { completed: number; failed: number; running: number; pending: number }>()

    // 初始化最近7天的日期
    for (let i = 6; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateStr = date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
      grouped.set(dateStr, { completed: 0, failed: 0, running: 0, pending: 0 })
    }

    // 统计任务
    tasks.forEach((task: TaskResponse) => {
      const taskDate = new Date(task.created_at)
      const dateStr = taskDate.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })

      if (grouped.has(dateStr)) {
        const stats = grouped.get(dateStr)!
        switch (task.status) {
          case 'completed':
            stats.completed++
            break
          case 'failed':
            stats.failed++
            break
          case 'running':
            stats.running++
            break
          case 'pending':
          case 'pending_approval':
            stats.pending++
            break
        }
      }
    })

    return Array.from(grouped.entries()).map(([date, stats]) => ({
      date,
      ...stats,
    }))
  })()

  return { trends, isLoading }
}

/**
 * 获取最近任务列表（用于Dashboard表格）
 *
 * 特性：
 * - 当列表中有活跃任务（running/pending/pending_approval/canceling）时，自动每 3 秒轮询
 */
export function useRecentTasks(limit = 10) {
  return useTaskList({
    hours: 24 * 30, // 最近30天
    limit,
    enablePolling: true,
  })
}

/**
 * 任务状态计数
 * 使用 useQueries 并行查询各状态任务数量
 */
export function useTaskStatusCounts() {
  const statuses: TaskStatus[] = ['running', 'completed', 'failed', 'pending_approval', 'pending']

  const queries = useQueries({
    queries: statuses.map((status) => ({
      queryKey: [...queryKeys.tasks.all, 'list', { filters: { status }, params: { limit: 1 } }],
      queryFn: async () => {
        const response = await api.get<TaskListResponse>('/task/list', {
          params: { status, limit: 1 },
        })
        return response
      },
      // 状态计数不需要频繁更新，每 30 秒刷新一次即可
      refetchInterval: 30 * 1000,
      staleTime: 30 * 1000,
    })),
  })

  const counts = queries.reduce(
    (acc, query, index) => {
      const status = statuses[index]
      acc[status] = query.data?.total ?? 0
      return acc
    },
    {} as Record<TaskStatus, number>
  )

  const isLoading = queries.some((q) => q.isLoading)

  return { counts, isLoading }
}
