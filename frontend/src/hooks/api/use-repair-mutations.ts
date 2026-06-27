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
