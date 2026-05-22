import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api/client'
import { queryKeys } from '@/lib/query/keys'
import endpoints from '@/lib/api/endpoints'
import type { RepoListResponse, RepoListParams, RepoStatus } from '@/lib/api/types'

interface UseRepoListParams extends Omit<RepoListParams, 'statuses'> {
  repoType?: 'all' | 'model' | 'dataset'
  statuses?: RepoStatus[]
}

const PAGE_SIZE = 20

export function useRepoList(params: UseRepoListParams) {
  const { repoType, skip = 0, limit = PAGE_SIZE, statuses, ...rest } = params

  return useQuery({
    queryKey: queryKeys.repos.list({ repoType, skip, limit, statuses, ...rest }),
    queryFn: () => {
      const queryParams: Record<string, unknown> = {}

      if (repoType && repoType !== 'all') {
        queryParams.repo_type = repoType
      }
      if (skip !== undefined) queryParams.skip = skip
      if (limit !== undefined) queryParams.limit = limit
      if (statuses && statuses.length > 0) {
        queryParams.statuses = statuses
      }
      if (rest.pipeline_tag) queryParams.pipeline_tag = rest.pipeline_tag
      if (rest.search) queryParams.search = rest.search
      if (rest.sort_by) queryParams.sort_by = rest.sort_by
      if (rest.sort_order) queryParams.sort_order = rest.sort_order

      return api.get<RepoListResponse>(endpoints.repo.hfList, {
        params: queryParams,
        paramsSerializer: {
          indexes: null,
        },
      })
    },
  })
}

export { PAGE_SIZE }
