import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type {
  TaskResponse,
  ApiResponse,
  RepoSource,
  RepoType,
  AsyncPreviewTaskResponse,
  AsyncPreviewTaskStatusResponse,
  TaskPreviewData,
  PreviewTaskStatus,
  ApiError,
} from '@/lib/api-types'

// ==================== 类型定义 ====================

export interface TaskPreviewRequest {
  source: RepoSource
  repo_type: RepoType
  repo_id: string
  revision?: string
  hf_endpoint?: string
  access_token?: string
  full_download?: boolean
  allow_patterns?: string[]
  ignore_patterns?: string[]
}

export interface TaskPreviewItem {
  path: string
  size: number
  type: 'file' | 'directory'
  required: boolean
}

interface CreateTaskRequest {
  cache_key: string
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
    mutationFn: async (cacheKey: string): Promise<TaskResponse> => {
      const response = await api.post<CreateTaskResponse>('/task', {
        cache_key: cacheKey,
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
   * 重试失败的任务（7天以内结束的），新任务自动审批
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
    pinTask,
    unpinTask,
    retryTask,
  }
}

// ==================== 异步预览任务 Hook ====================

export interface UseAsyncPreviewTaskOptions {
  /** 轮询间隔（毫秒），默认 1000ms */
  pollInterval?: number
  /** 最大轮询次数，默认 300（5分钟） */
  maxPolls?: number
}

export interface UseAsyncPreviewTaskReturn {
  /** 启动预览任务 */
  startPreview: (data: TaskPreviewRequest) => void
  /** 取消正在进行的预览 */
  cancelPreview: () => void
  /** 重置所有状态 */
  reset: () => void
  /** 是否正在启动任务 */
  isStarting: boolean
  /** 是否正在轮询中 */
  isPolling: boolean
  /** 当前任务状态 */
  status: PreviewTaskStatus | null
  /** 进度消息 */
  progressMessage: string
  /** 进度百分比（0-100） */
  progressPercent: number
  /** 已使用时间（毫秒） */
  elapsedTime: number
  /** 预览结果数据（完成后） */
  data: TaskPreviewData | null
  /** 错误信息 */
  error: Error | null
  /** 是否已完成 */
  isSuccess: boolean
  /** 是否失败 */
  isError: boolean
}

/**
 * 异步预览任务 Hook
 *
 * 处理后台预览任务的启动和轮询。
 *
 * 使用示例：
 * ```tsx
 * const preview = useAsyncPreviewTask({
 *   pollInterval: 1000,
 *   maxPolls: 300,
 * })
 *
 * // 启动预览
 * preview.startPreview({
 *   source: 'huggingface',
 *   repo_type: 'model',
 *   repo_id: 'bert-base-uncased',
 *   full_download: true,
 * })
 *
 * // 在 UI 中显示进度
 * if (preview.isPolling) {
 *   return <Progress value={preview.progressPercent} />
 * }
 *
 * if (preview.isSuccess) {
 *   return <PreviewData data={preview.data} />
 * }
 * ```
 */
export function useAsyncPreviewTask(
  options: UseAsyncPreviewTaskOptions = {}
): UseAsyncPreviewTaskReturn {
  const { pollInterval = 1000, maxPolls = 300 } = options

  const [taskId, setTaskId] = useState<string | null>(null)
  const [status, setStatus] = useState<PreviewTaskStatus | null>(null)
  const [progressMessage, setProgressMessage] = useState('')
  const [progressPercent, setProgressPercent] = useState(0)
  const [data, setData] = useState<TaskPreviewData | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [, setPollCount] = useState(0)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)

  // 启动预览任务
  const startPreview = useCallback(async (requestData: TaskPreviewRequest) => {
    setIsStarting(true)
    setError(null)
    setData(null)
    setStatus(null)
    setProgressMessage('')
    setProgressPercent(0)
    setPollCount(0)
    setStartTime(Date.now())
    setElapsedTime(0)

    try {
      const result = await api.post<AsyncPreviewTaskResponse>('/task/preview', requestData)
      setTaskId(result.data.task_id)
    } catch (err) {
      // ApiError 有 message 字段，直接使用
      const errorMessage = (err as ApiError).message ?? '启动预览任务失败'
      setError(new Error(errorMessage))
    } finally {
      setIsStarting(false)
    }
  }, [])

  // 取消预览
  const cancelPreview = useCallback(() => {
    setTaskId(null)
    setStatus(null)
    setPollCount(0)
    setIsStarting(false)
  }, [])

  // 轮询任务状态
  useEffect(() => {
    if (!taskId) return
    if (status === 'completed' || status === 'failed') return

    let currentPollCount = 0

    const fetchStatus = async () => {
      try {
        const result = await api.get<AsyncPreviewTaskStatusResponse>(
          `/task/preview/${taskId}`
        )
        const taskData = result.data

        setStatus(taskData.status)
        setProgressMessage(taskData.progress_message)
        setProgressPercent(taskData.progress_percent)
        setPollCount(currentPollCount)

        if (taskData.status === 'completed' && taskData.result) {
          setData(taskData.result)
        } else if (taskData.status === 'failed') {
          setError(new Error(taskData.error_message || '预览任务失败'))
        }
      } catch (err) {
        const errorMessage = (err as ApiError).message ?? '获取预览状态失败'
        setError(new Error(errorMessage))
      }
    }

    // 立即执行一次
    fetchStatus()

    // 设置轮询间隔
    const interval = setInterval(() => {
      currentPollCount++
      setPollCount(currentPollCount)

      if (currentPollCount >= maxPolls) {
        setError(new Error('预览任务超时，请稍后重试'))
        clearInterval(interval)
        return
      }

      fetchStatus()
    }, pollInterval)

    return () => clearInterval(interval)
  }, [taskId, status, pollInterval, maxPolls])

  const isPolling = !!taskId && status !== 'completed' && status !== 'failed' && !error
  const isSuccess = status === 'completed' && !!data
  const isError = status === 'failed' || !!error

  // 计时器：更新已使用时间
  useEffect(() => {
    if (!isPolling || !startTime) return

    const timer = setInterval(() => {
      setElapsedTime(Date.now() - startTime)
    }, 1000)

    return () => clearInterval(timer)
  }, [isPolling, startTime])

  /** 重置所有状态 */
  const reset = useCallback(() => {
    setTaskId(null)
    setStatus(null)
    setProgressMessage('')
    setProgressPercent(0)
    setData(null)
    setError(null)
    setIsStarting(false)
    setPollCount(0)
    setStartTime(null)
    setElapsedTime(0)
  }, [])

  return {
    startPreview,
    cancelPreview,
    reset,
    isStarting,
    isPolling,
    status,
    progressMessage,
    progressPercent,
    elapsedTime,
    data,
    error,
    isSuccess,
    isError,
  }
}
