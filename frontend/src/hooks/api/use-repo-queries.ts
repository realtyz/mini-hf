import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api/client";
import endpoints from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/query/keys";
import type {
  RepairResponse,
  SetProfileStatusRequest,
  SetSnapshotStatusRequest,
} from "@/lib/api/types";
import { toast } from "sonner";

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

/**
 * Mutation hook: change a repository profile's status.
 * Invalidates the repo detail query on success.
 */
export function useSetProfileStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      repoId,
      ...body
    }: SetProfileStatusRequest & {
      repoId: string;
    }): Promise<RepairResponse> => {
      return api.patch<RepairResponse>(
        endpoints.adminRepair.profileStatus(repoId),
        body,
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.repos.detail(variables.repoId),
      });
      toast.success("仓库状态已更新");
    },
    onError: () => {
      toast.error("状态更新失败");
    },
  });
}

/**
 * Mutation hook: change a snapshot's status.
 * Invalidates the repo detail query on success.
 */
export function useSetSnapshotStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      snapshotId,
      status,
    }: SetSnapshotStatusRequest & {
      snapshotId: number;
      repoId: string;
    }): Promise<RepairResponse> => {
      return api.patch<RepairResponse>(
        endpoints.adminRepair.snapshotStatus(snapshotId),
        { status },
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.repos.detail(variables.repoId),
      });
      toast.success("版本状态已更新");
    },
    onError: () => {
      toast.error("状态更新失败");
    },
  });
}
