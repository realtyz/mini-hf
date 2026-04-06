import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { TaskResponse, ApiResponse } from '@/lib/api-types'

/**
 * 获取任务详情
 * 需要 JWT 认证
 * 当任务处于非终态时自动轮询
 */
export function useTaskDetail(taskId: number | null) {
  const { data, isLoading, error, refetch } = useQuery<TaskResponse>({
    queryKey: queryKeys.tasks.detail(taskId),
    queryFn: async () => {
      if (!taskId) throw new Error('Task ID is required')
      const response = await api.get<ApiResponse<TaskResponse>>(`/task/${taskId}`)
      return response.data
    },
    enabled: !!taskId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      // 非终态任务每 3 秒轮询一次
      const nonTerminalStatuses = ['pending_approval', 'pending', 'running', 'canceling']
      if (status && nonTerminalStatuses.includes(status)) {
        return 3000
      }
      return false
    },
    refetchOnWindowFocus: false,
    staleTime: 5000,
    gcTime: 300000,
  })

  return { data, isLoading, error, refetch }
}
