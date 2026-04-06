import { useQuery } from '@tanstack/react-query'

import { queryKeys } from '@/lib/query-keys'
import api from '@/lib/api'
import type { TaskProgressData, TaskStatus, ApiResponse } from '@/lib/api-types'

/**
 * 获取任务文件级进度
 *
 * - 仅在任务状态为 running 时启用查询
 * - 任务运行时每 1 秒轮询一次
 * - 任务停止后停止轮询
 */
export function useTaskProgress(
  taskId: number | null,
  taskStatus: TaskStatus | undefined
) {
  // 使用宽松比较，处理大小写不一致问题
  const isRunning = taskStatus?.toLowerCase() === 'running'

  return useQuery<TaskProgressData>({
    queryKey: queryKeys.tasks.progress(taskId),
    queryFn: async () => {
      if (!taskId) {
        throw new Error('Task ID is required')
      }
      const response = await api.get<ApiResponse<TaskProgressData>>(
        `/task/${taskId}/progress`
      )
      return response.data
    },
    enabled: !!taskId && isRunning,
    refetchInterval: () => {
      // 使用传入的 taskStatus 判断，确保第一次就能正确轮询
      // 第一次请求时 query.state.data 为 undefined，不能依赖它判断
      return isRunning ? 1000 : false
    },
    staleTime: 1000,
    retry: (failureCount, error) => {
      // 404 错误不重试（任务未开始或已完成）
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { status?: number } }
        if (axiosError.response?.status === 404) {
          return false
        }
      }
      return failureCount < 3
    },
  })
}
