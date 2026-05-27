import { useMutation } from '@tanstack/react-query'
import api from '@/lib/api/client'
import endpoints from '@/lib/api/endpoints'

export function useDeleteRepo() {
  return useMutation({
    mutationFn: async (repoId: string) => {
      const endpoint = endpoints.repo.hfDetail(repoId)
      return api.delete(endpoint, { timeout: 60000 })
    },
  })
}
