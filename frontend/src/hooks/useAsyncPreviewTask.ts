import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import type {
  RepoSource,
  RepoType,
  AsyncPreviewTaskResponse,
  AsyncPreviewTaskStatusResponse,
  TaskPreviewData,
  PreviewTaskStatus,
  ApiError,
} from '@/lib/api-types'

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

export interface UseAsyncPreviewTaskOptions {
  pollInterval?: number
  maxPolls?: number
}

export interface UseAsyncPreviewTaskReturn {
  startPreview: (data: TaskPreviewRequest) => void
  cancelPreview: () => void
  reset: () => void
  isStarting: boolean
  isPolling: boolean
  status: PreviewTaskStatus | null
  progressMessage: string
  progressPercent: number
  elapsedTime: number
  data: TaskPreviewData | null
  error: Error | null
  isSuccess: boolean
  isError: boolean
}

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
      const errorMessage = (err as ApiError).message ?? '启动预览任务失败'
      setError(new Error(errorMessage))
    } finally {
      setIsStarting(false)
    }
  }, [])

  const cancelPreview = useCallback(() => {
    setTaskId(null)
    setStatus(null)
    setPollCount(0)
    setIsStarting(false)
  }, [])

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

    fetchStatus()

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

  useEffect(() => {
    if (!isPolling || !startTime) return

    const timer = setInterval(() => {
      setElapsedTime(Date.now() - startTime)
    }, 1000)

    return () => clearInterval(timer)
  }, [isPolling, startTime])

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
