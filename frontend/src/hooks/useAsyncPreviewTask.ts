import { useState, useCallback, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import endpoints from '@/lib/api-endpoints'
import { queryKeys } from '@/lib/query-keys'
import { useElapsedTimer } from '@/hooks/useElapsedTimer'
import { STRINGS } from '@/lib/constants/strings'
import type {
  RepoSource,
  RepoType,
  AsyncPreviewTaskResponse,
  AsyncPreviewTaskStatusResponse,
  TaskPreviewData,
  PreviewTaskStatus,
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
  const [startTime, setStartTime] = useState<number | null>(null)
  const pollCountRef = useRef(0)
  const queryClient = useQueryClient()

  const startMutation = useMutation({
    mutationFn: async (requestData: TaskPreviewRequest) => {
      const result = await api.post<AsyncPreviewTaskResponse>(endpoints.task.preview, requestData)
      return result.data.task_id
    },
    onSuccess: (id) => {
      setTaskId(id)
      pollCountRef.current = 0
      setStartTime(Date.now())
    },
  })

  const statusQuery = useQuery({
    queryKey: queryKeys.tasks.previewStatus(taskId),
    queryFn: async () => {
      pollCountRef.current += 1
      const result = await api.get<AsyncPreviewTaskStatusResponse>(
        endpoints.task.previewStatus(taskId!)
      )
      return result.data
    },
    enabled: !!taskId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'completed' || status === 'failed') return false
      if (pollCountRef.current >= maxPolls) return false
      return pollInterval
    },
    retry: false,
  })

  const startPreview = useCallback(
    (requestData: TaskPreviewRequest) => {
      startMutation.mutate(requestData)
    },
    [startMutation]
  )

  const cancelPreview = useCallback(() => {
    setTaskId(null)
    queryClient.removeQueries({ queryKey: queryKeys.tasks.previewStatus(taskId) })
  }, [taskId, queryClient])

  const reset = useCallback(() => {
    setTaskId(null)
    setStartTime(null)
    pollCountRef.current = 0
    queryClient.removeQueries({ queryKey: queryKeys.tasks.previewStatus(taskId) })
    startMutation.reset()
  }, [taskId, queryClient, startMutation])

  const status = statusQuery.data?.status ?? null
  const isTerminal = status === 'completed' || status === 'failed'
  const timedOut = pollCountRef.current >= maxPolls && !!taskId && !isTerminal
  const hasError = status === 'failed' || !!startMutation.error || !!statusQuery.error || timedOut

  const isStarting = startMutation.isPending
  const isPolling = !!taskId && !isTerminal && !hasError
  const isSuccess = status === 'completed' && !!statusQuery.data?.result
  const isError = hasError

  const elapsedTime = useElapsedTimer(isPolling, startTime)

  const error: Error | null = (startMutation.error as Error | null)
    ?? (statusQuery.error as Error | null)
    ?? (timedOut ? new Error(STRINGS.taskPreviewTimeout) : null)

  return {
    startPreview,
    cancelPreview,
    reset,
    isStarting,
    isPolling,
    status,
    progressMessage: statusQuery.data?.progress_message ?? '',
    progressPercent: statusQuery.data?.progress_percent ?? 0,
    elapsedTime,
    data: statusQuery.data?.result ?? null,
    error,
    isSuccess,
    isError,
  }
}
