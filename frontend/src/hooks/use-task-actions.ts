import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/api/client'
import endpoints from '@/lib/api/endpoints'
import { queryKeys } from '@/lib/query/keys'
import type {
  TaskResponse,
  ApiResponse,
  AsyncPreviewTaskResponse,
  ApiError,
} from '@/lib/api/types'
import type { TaskPreviewRequest } from '@/hooks/use-async-preview-task'

// ==================== 类型定义 ====================

interface CreateTaskRequest {
  cache_key: string
  selected_files?: string[]
}

type CreateTaskResponse = ApiResponse<TaskResponse>

interface ReviewTaskRequest {
  approved: boolean
  notes?: string
}

type TaskActionResponse = ApiResponse<TaskResponse>

// ==================== 工厂函数 ====================

interface CreateTaskMutationOptions<TVars> {
  /** toast 中显示的操作名称，如 "取消任务" */
  actionName: string
  /** 是否同时刷新任务详情缓存，默认 true */
  invalidateDetail?: boolean
  /** 自定义 onError，覆盖默认 toast */
  onError?: (error: ApiError, variables: TVars) => void
}

/**
 * 任务操作 mutation 工厂
 * 统一处理 onSuccess（刷新列表 + 可选详情）和 onError（toast 提示）
 */
function useCreateTaskMutation<TVars>(
  mutationFn: (variables: TVars) => Promise<TaskResponse>,
  getTaskId: (variables: TVars) => number,
  options: CreateTaskMutationOptions<TVars>,
  queryClient: ReturnType<typeof useQueryClient>
) {
  const { actionName, invalidateDetail = true, onError } = options

  return useMutation({
    mutationFn,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all })
      if (invalidateDetail) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.tasks.detail(getTaskId(variables)),
        })
      }
    },
    onError: onError ?? ((error: ApiError) => {
      toast.error(`${actionName}失败`, { description: error.message })
    }),
  })
}

// ==================== Hooks ====================

export function useTaskActions() {
  const queryClient = useQueryClient()

  const startPreviewTask = useMutation({
    mutationFn: async (data: TaskPreviewRequest): Promise<string> => {
      const response = await api.post<AsyncPreviewTaskResponse>(endpoints.task.preview, data)
      return response.data.task_id
    },
  })

  const createTask = useMutation({
    mutationFn: async ({
      cacheKey,
      selectedFiles,
    }: {
      cacheKey: string
      selectedFiles: string[]
    }): Promise<TaskResponse> => {
      const response = await api.post<CreateTaskResponse>(endpoints.task.create, {
        cache_key: cacheKey,
        selected_files: selectedFiles,
      } as CreateTaskRequest)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all })
    },
  })

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
      const response = await api.post<TaskActionResponse>(
        endpoints.task.review(taskId),
        { approved, notes } as ReviewTaskRequest
      )
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all })
      queryClient.invalidateQueries({
        queryKey: queryKeys.tasks.detail(variables.taskId),
      })
    },
    onError: (error: ApiError, variables) => {
      const action = variables.approved ? '批准' : '拒绝'
      toast.error(`${action}任务失败`, { description: error.message })
    },
  })

  const cancelTask = useCreateTaskMutation(
    async (taskId: number) => {
      const response = await api.post<TaskActionResponse>(endpoints.task.cancel(taskId))
      return response.data
    },
    (taskId) => taskId,
    { actionName: '取消任务' },
    queryClient
  )

  const pauseTask = useCreateTaskMutation(
    async (taskId: number) => {
      const response = await api.post<TaskActionResponse>(endpoints.task.pause(taskId))
      return response.data
    },
    (taskId) => taskId,
    { actionName: '暂停任务' },
    queryClient
  )

  const resumeTask = useCreateTaskMutation(
    async (taskId: number) => {
      const response = await api.post<TaskActionResponse>(endpoints.task.resume(taskId))
      return response.data
    },
    (taskId) => taskId,
    { actionName: '恢复任务' },
    queryClient
  )

  const pinTask = useCreateTaskMutation(
    async (taskId: number) => {
      const response = await api.post<TaskActionResponse>(endpoints.task.pin(taskId))
      return response.data
    },
    (taskId) => taskId,
    { actionName: '置顶任务' },
    queryClient
  )

  const unpinTask = useCreateTaskMutation(
    async (taskId: number) => {
      const response = await api.post<TaskActionResponse>(endpoints.task.unpin(taskId))
      return response.data
    },
    (taskId) => taskId,
    { actionName: '取消置顶' },
    queryClient
  )

  const retryTask = useCreateTaskMutation(
    async (taskId: number) => {
      const response = await api.post<TaskActionResponse>(endpoints.task.retry(taskId))
      return response.data
    },
    (taskId) => taskId,
    { actionName: '重试任务', invalidateDetail: false },
    queryClient
  )

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
