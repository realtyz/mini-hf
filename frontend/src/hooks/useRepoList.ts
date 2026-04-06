import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { RepoListResponse, RepoListParams, RepoStatus } from '@/lib/api-types'

interface UseRepoListParams extends Omit<RepoListParams, 'statuses'> {
  repoType?: 'all' | 'model' | 'dataset'
  statuses?: RepoStatus[]
}

const PAGE_SIZE = 20

async function fetchRepositories(params: UseRepoListParams): Promise<RepoListResponse> {
  const queryParams: Record<string, unknown> = {}

  if (params.repoType && params.repoType !== 'all') {
    queryParams.repo_type = params.repoType
  }
  if (params.skip !== undefined) queryParams.skip = params.skip
  if (params.limit !== undefined) queryParams.limit = params.limit
  if (params.statuses && params.statuses.length > 0) {
    queryParams.statuses = params.statuses
  }
  if (params.pipeline_tag) queryParams.pipeline_tag = params.pipeline_tag
  if (params.search) queryParams.search = params.search
  if (params.sort_by) queryParams.sort_by = params.sort_by
  if (params.sort_order) queryParams.sort_order = params.sort_order

  return api.get<RepoListResponse>('/hf_repo/list', {
    params: queryParams,
    paramsSerializer: {
      indexes: null, // Use repeat format: statuses=active&statuses=updating
    },
  })
}

export function useRepoList(params: UseRepoListParams) {
  const { repoType, skip = 0, limit = PAGE_SIZE, statuses, ...rest } = params

  return useQuery({
    queryKey: ['repositories', { repoType, skip, limit, statuses, ...rest }],
    queryFn: () => fetchRepositories({ repoType, skip, limit, statuses, ...rest }),
  })
}

export { PAGE_SIZE }
