import { useMutation } from '@tanstack/react-query'
import api from '@/lib/api'
import endpoints from '@/lib/api-endpoints'

export function useDeleteRepo() {
  return useMutation({
    mutationFn: async ({ repoId, hard }: { repoId: string; hard: boolean }) => {
      const endpoint = endpoints.repo.hfDetail(repoId)
      return api.delete(endpoint, { params: { hard } })
    },
  })
}
