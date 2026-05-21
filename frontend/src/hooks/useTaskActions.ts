import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type {
  TaskResponse,
  ApiResponse,
  AsyncPreviewTaskResponse,
  ApiError,
} from '@/lib/api-types'
import type { TaskPreviewRequest } from '@/hooks/useAsyncPreviewTask'

// ==================== 类型定义 ====================

interface CreateTaskRequest {
  cache_key: string
  selected_files?: string[]
}

interface CreateTaskResponse extends ApiResponse<TaskResponse> {}

interface ReviewTaskRequest {
  approved: boolean
  notes?: string
}

interface ReviewTaskResponse extends ApiResponse<TaskResponse> {}

// ==================== Hooks ====================

export function useTaskActions() {
  const queryClient = useQueryClient()

  /**
   * 创建异步预览任务
   * 启动后台任务获取仓库文件列表，返回 task_id 用于轮询
   */
  const startPreviewTask = useMutation({
    mutationFn: async (data: TaskPreviewRequest): Promise<string> => {
      const response = await api.post<AsyncPreviewTaskResponse>('/task/preview', data)
      return response.data.task_id
    },
  })

  /**
   * 创建任务
   * 使用预览接口返回的 cache_key 创建任务
   */
  const createTask = useMutation({
    mutationFn: async ({
      cacheKey,
      selectedFiles,
    }: {
      cacheKey: string
      selectedFiles: string[]
    }): Promise<TaskResponse> => {
      const response = await api.post<CreateTaskResponse>('/task', {
        cache_key: cacheKey,
        selected_files: selectedFiles,
      } as CreateTaskRequest)
      return response.data
    },
    onSuccess: () => {
      // 创建成功后刷新任务列表
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all })
    },
  })

  /**
   * 审批任务
   * 管理员批准或拒绝待审批任务
   */
  const reviewTask = useMutation({
    mutationFn: async ({
      taskId,
      approved,
      notes,
    }: {
      taskId: number
      approved: boolean
      notes?: string
    }): Promise<TaskResponse> => {
      const response = await api.post<ReviewTaskResponse>(
        `/task/${taskId}/review`,
        { approved, notes } as ReviewTaskRequest
      )
      return response.data
    },
    onSuccess: (_, variables) => {
      // 审批成功后刷新任务列表和详情
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all })
      queryClient.invalidateQueries({
        queryKey: queryKeys.tasks.detail(variables.taskId),
      })
    },
    onError: (error: ApiError, variables) => {
      const action = variables.approved ? '批准' : '拒绝'
      toast.error(`${action}任务失败`, {
        description: error.message,
      })
    },
  })

  /**
   * 取消任务
   * 任务创建者或管理员可取消 running / pending 状态的任务
   */
  const cancelTask = useMutation({
    mutationFn: async (taskId: number): Promise<TaskResponse> => {
      const response = await api.post<ReviewTaskResponse>(`/task/${taskId}/cancel`)
      return response.data
    },
    onSuccess: (_, taskId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(taskId) })
    },
    onError: (error: ApiError) => {
      toast.error('取消任务失败', {
        description: error.message,
      })
    },
  })

  /**
   * 暂停任务
   * 任务创建者或管理员可暂停 running / pending 状态的任务
   */
  const pauseTask = useMutation({
    mutationFn: async (taskId: number): Promise<TaskResponse> => {
      const response = await api.post<ReviewTaskResponse>(`/task/${taskId}/pause`)
      return response.data
    },
    onSuccess: (_, taskId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(taskId) })
    },
    onError: (error: ApiError) => {
      toast.error('暂停任务失败', {
        description: error.message,
      })
    },
  })

  /**
   * 恢复任务
   * 任务创建者或管理员可恢复 paused 状态的任务
   */
  const resumeTask = useMutation({
    mutationFn: async (taskId: number): Promise<TaskResponse> => {
      const response = await api.post<ReviewTaskResponse>(`/task/${taskId}/resume`)
      return response.data
    },
    onSuccess: (_, taskId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(taskId) })
    },
    onError: (error: ApiError) => {
      toast.error('恢复任务失败', {
        description: error.message,
      })
    },
  })

  /**
   * 置顶任务
   * 管理员可将 pending 状态的任务置顶，提高执行优先级
   */
  const pinTask = useMutation({
    mutationFn: async (taskId: number): Promise<TaskResponse> => {
      const response = await api.post<ReviewTaskResponse>(`/task/${taskId}/pin`)
      return response.data
    },
    onSuccess: (_, taskId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(taskId) })
    },
    onError: (error: ApiError) => {
      toast.error('置顶任务失败', {
        description: error.message,
      })
    },
  })

  /**
   * 取消置顶任务
   * 管理员可取消已置顶任务的优先级
   */
  const unpinTask = useMutation({
    mutationFn: async (taskId: number): Promise<TaskResponse> => {
      const response = await api.post<ReviewTaskResponse>(`/task/${taskId}/unpin`)
      return response.data
    },
    onSuccess: (_, taskId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(taskId) })
    },
    onError: (error: ApiError) => {
      toast.error('取消置顶失败', {
        description: error.message,
      })
    },
  })

  /**
   * 重试任务
   * 重试失败或已取消的任务（7天以内结束的），新任务自动审批
   */
  const retryTask = useMutation({
    mutationFn: async (taskId: number): Promise<TaskResponse> => {
      const response = await api.post<ReviewTaskResponse>(`/task/${taskId}/retry`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all })
    },
    onError: (error: ApiError) => {
      toast.error('重试任务失败', {
        description: error.message,
      })
    },
  })

  return {
    startPreviewTask,
    createTask,
    reviewTask,
    cancelTask,
    pauseTask,
    resumeTask,
    pinTask,
    unpinTask,
    retryTask,
  }
}
