/**
 * 仓库/模型相关 API Hooks
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type {
  ApiResponse,
  DryRunRequest,
  DryRunResponse,
  PaginatedResponse,
  PaginationParams,
  RepoDownloadRequest,
  RepoResponse,
  TaskResponse,
} from '@/lib/api-types'

/**
 * 获取仓库列表
 */
export function useRepos(pagination?: PaginationParams) {
  return useQuery({
    queryKey: queryKeys.repos.list(pagination),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (pagination?.page) params.append('page', String(pagination.page))
      if (pagination?.page_size)
        params.append('page_size', String(pagination.page_size))

      const queryString = params.toString()
      const url = `/repos/${queryString ? `?${queryString}` : ''}`

      const response = await api.get<ApiResponse<PaginatedResponse<RepoResponse>>>(url)
      return response.data
    },
  })
}

/**
 * 获取仓库详情
 */
export function useRepo(repoId: string) {
  return useQuery({
    queryKey: queryKeys.repos.detail(repoId),
    queryFn: async () => {
      const response = await api.get<ApiResponse<RepoResponse>>(`/repos/${repoId}`)
      return response.data
    },
    enabled: !!repoId,
  })
}

/**
 * 下载仓库（创建下载任务）
 */
export function useDownloadRepo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: RepoDownloadRequest) => {
      const response = await api.post<ApiResponse<TaskResponse>>('/repos', data)
      return response.data
    },
    onSuccess: () => {
      // 创建任务后刷新仓库列表和任务列表
      queryClient.invalidateQueries({ queryKey: queryKeys.repos.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all })
    },
  })
}

/**
 * 预演下载（查看将要下载的文件列表）
 */
export function useDryRunDownload() {
  return useMutation({
    mutationFn: async (data: DryRunRequest) => {
      const response = await api.post<ApiResponse<DryRunResponse>>(
        '/repos/dry-run',
        data
      )
      return response.data
    },
  })
}

/**
 * 删除仓库
 */
export function useDeleteRepo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (repoId: string) => {
      const response = await api.delete<ApiResponse<void>>(`/repos/${repoId}`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.repos.all })
    },
  })
}
