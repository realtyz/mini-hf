import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { TaskProgressResponse, TaskProgressData } from '@/lib/api-types'

/**
 * 获取任务进度
 * 自动轮询进行中任务的进度
 */
export function useTaskProgress(taskId: number | null, enabled: boolean = true) {
  return useQuery<TaskProgressData>({
    queryKey: queryKeys.tasks.progress(taskId),
    queryFn: async () => {
      if (!taskId) throw new Error('Task ID is required')
      const response = await api.get<TaskProgressResponse>(`/task/${taskId}/progress`)
      return response.data
    },
    enabled: !!taskId && enabled,
    refetchInterval: (query) => {
      const data = query.state.data
      // 如果任务进行中，每 2 秒轮询一次
      if (data?.status === 'running') {
        return 2000
      }
      // 其他状态停止轮询
      return false
    },
    refetchOnWindowFocus: false,
    staleTime: 1000,
    gcTime: 300000,
  })
}
