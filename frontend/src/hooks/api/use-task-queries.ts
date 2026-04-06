/**
 * 任务相关 API Hooks
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  TaskListFilters,
  TaskResponse,
} from '@/lib/api-types'

/**
 * 获取任务列表
 */
export function useTasks(
  filters?: TaskListFilters,
  pagination?: PaginationParams
) {
  return useQuery({
    queryKey: queryKeys.tasks.list(filters, pagination),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.status) params.append('status', filters.status)
      if (pagination?.page) params.append('page', String(pagination.page))
      if (pagination?.page_size)
        params.append('page_size', String(pagination.page_size))

      const queryString = params.toString()
      const url = `/tasks/${queryString ? `?${queryString}` : ''}`

      const response = await api.get<ApiResponse<PaginatedResponse<TaskResponse>>>(url)
      return response.data
    },
  })
}

/**
 * 获取单个任务详情
 */
export function useTask(taskId: number) {
  return useQuery({
    queryKey: queryKeys.tasks.detail(taskId),
    queryFn: async () => {
      const response = await api.get<ApiResponse<TaskResponse>>(`/tasks/${taskId}`)
      return response.data
    },
    enabled: !!taskId,
  })
}

/**
 * 取消任务
 */
export function useCancelTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (taskId: number) => {
      const response = await api.post<ApiResponse<TaskResponse>>(
        `/tasks/${taskId}/cancel`
      )
      return response.data
    },
    onSuccess: () => {
      // 取消成功后刷新任务列表
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all })
    },
  })
}

/**
 * 重试失败的任务
 */
export function useRetryTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (taskId: number) => {
      const response = await api.post<ApiResponse<TaskResponse>>(
        `/tasks/${taskId}/retry`
      )
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all })
    },
  })
}
