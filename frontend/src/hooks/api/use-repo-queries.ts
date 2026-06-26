import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api/client";
import endpoints from "@/lib/api/endpoints";

interface DeleteRepoParams {
  repoId: string;
  /** Required for untracked repos (S3 data without DB profile) */
  repoType?: string;
}

export function useDeleteRepo() {
  return useMutation({
    mutationFn: async (params: string | DeleteRepoParams) => {
      const { repoId, repoType } =
        typeof params === "string"
          ? { repoId: params, repoType: undefined }
          : params;
      const endpoint = endpoints.repo.hfDetail(repoId);
      const config: { timeout: number; params?: Record<string, string> } = {
        timeout: 60000,
      };
      if (repoType) {
        config.params = { repo_type: repoType };
      }
      return api.delete(endpoint, config);
    },
  });
}
