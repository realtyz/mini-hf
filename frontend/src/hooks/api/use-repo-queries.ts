import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api/client";
import endpoints from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/query/keys";
import type {
  RepairResponse,
  SetProfileStatusRequest,
  SetSnapshotStatusRequest,
  RepoListResponse,
  RepoListParams,
  RepoStatus,
  RepoDetailResponse,
} from "@/lib/api/types";
import { toast } from "sonner";

interface DeleteRepoParams {
  repoId: string;
  /** Required for untracked repos (S3 data without DB profile) */
  repoType?: string;
}

type RepoModelSource = "huggingface" | "modelscope";

/**
 * Mutation hook: delete a repository (profile + snapshots + S3 data).
 * Routes to HF (/hf_repo) or MS (/ms_repo) endpoint based on source.
 */
export function useDeleteRepo(source: RepoModelSource = "huggingface") {
  return useMutation({
    mutationFn: async (params: string | DeleteRepoParams) => {
      const { repoId, repoType } =
        typeof params === "string"
          ? { repoId: params, repoType: undefined }
          : params;
      const endpoint =
        source === "modelscope"
          ? endpoints.repo.msDetail(repoId)
          : endpoints.repo.hfDetail(repoId);
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
 * Invalidates the repo detail query on success (respecting source dimension).
 */
export function useSetProfileStatus(source: RepoModelSource = "huggingface") {
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
        queryKey: queryKeys.repos.detail(variables.repoId, source),
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
 * Invalidates the repo detail query on success (respecting source dimension).
 */
export function useSetSnapshotStatus(source: RepoModelSource = "huggingface") {
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
        queryKey: queryKeys.repos.detail(variables.repoId, source),
      });
      toast.success("版本状态已更新");
    },
    onError: () => {
      toast.error("状态更新失败");
    },
  });
}

// ==================== 仓库列表 / 详情查询 ====================

interface UseRepoListParams extends Omit<RepoListParams, "statuses"> {
  repoType?: "all" | "model" | "dataset";
  statuses?: RepoStatus[];
  /**
   * 公共模式（无需认证）。默认 false，控制台使用认证 API。
   * 按 modelSource 选择认证端点（hfList / msList）或公共端点（hfListPublic / msListPublic）。
   */
  public?: boolean;
  /** 选择数据源（HF / MS）；默认 huggingface */
  modelSource?: RepoModelSource;
}

/**
 * 获取仓库列表
 *
 * - 认证模式（默认）：按 modelSource 调用 /hf_repo/list 或 /ms_repo/list
 * - 公共模式（public: true）：按 modelSource 调用 hfListPublic / msListPublic
 *
 * 筛选、分页、排序参数统一在此构造，避免各页面重复拼装 query params。
 * 公共与认证模式使用不同 queryKey，缓存互不混淆。
 */
export function useRepoList(params: UseRepoListParams) {
  const {
    repoType,
    skip = 0,
    limit,
    statuses,
    public: isPublic = false,
    modelSource = "huggingface",
    ...rest
  } = params;

  const endpoint =
    isPublic
      ? modelSource === "modelscope"
        ? endpoints.repo.msListPublic
        : endpoints.repo.hfListPublic
      : modelSource === "modelscope"
        ? endpoints.repo.msList
        : endpoints.repo.hfList;

  const queryKey = isPublic
    ? queryKeys.repos.publicList({
        modelSource,
        repoType,
        statuses,
        search: rest.search,
        skip,
        limit,
      })
    : queryKeys.repos.list({
        modelSource,
        repoType,
        skip,
        limit,
        statuses,
        ...rest,
      });

  return useQuery({
    queryKey,
    queryFn: () => {
      const queryParams: Record<string, unknown> = {};

      if (repoType && repoType !== "all") {
        queryParams.repo_type = repoType;
      }
      if (skip !== undefined) queryParams.skip = skip;
      if (limit !== undefined) queryParams.limit = limit;
      if (statuses && statuses.length > 0) {
        queryParams.statuses = statuses;
      }
      if (rest.pipeline_tag) queryParams.pipeline_tag = rest.pipeline_tag;
      if (rest.search) queryParams.search = rest.search;
      if (rest.sort_by) queryParams.sort_by = rest.sort_by;
      if (rest.sort_order) queryParams.sort_order = rest.sort_order;

      return api.get<RepoListResponse>(endpoint, {
        params: queryParams,
        paramsSerializer: {
          indexes: null,
        },
      });
    },
  });
}

/**
 * 获取仓库详情（profile + snapshots）
 * 按 repoType 选择 model / dataset 端点，按 source 选择 HF / MS 端点
 */
export function useRepoDetail(
  repoId: string,
  repoType: string,
  source: RepoModelSource = "huggingface",
) {
  return useQuery({
    queryKey: queryKeys.repos.detail(repoId, source),
    queryFn: async () => {
      const repoEndpoint =
        source === "modelscope"
          ? repoType === "model"
            ? endpoints.repo.msModel(repoId)
            : endpoints.repo.msDataset(repoId)
          : repoType === "model"
            ? endpoints.repo.hfModel(repoId)
            : endpoints.repo.hfDataset(repoId);
      return api.get<RepoDetailResponse>(repoEndpoint);
    },
    enabled: !!repoId,
  });
}
