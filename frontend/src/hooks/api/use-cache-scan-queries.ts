import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { STALE_TIMES } from "@/lib/query/client";
import type { ScanResultResponse, BatchDeleteRepoResponse, BatchDeleteStatusResponse } from "@/lib/api/types";
import api from "@/lib/api/client";
import endpoints from "@/lib/api/endpoints";

export function useCacheScanResult() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.cacheScan.result(),
    queryFn: () => api.get<ScanResultResponse>(endpoints.cache.scanResult),
    staleTime: STALE_TIMES.config,
  });

  return {
    result: data?.data ?? null,
    isLoading,
    isError,
    error,
    refetch,
  };
}

export function useTriggerCacheScan() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      api.post<ScanResultResponse>(endpoints.cache.scanRun),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.cacheScan.result(), data);
    },
  });

  return mutation;
}

export function useBatchDeleteRepos() {
  return useMutation({
    mutationFn: ({
      repoIds,
      repoTypes,
    }: {
      repoIds: string[];
      repoTypes?: Record<string, string>;
    }) =>
      api.post<BatchDeleteRepoResponse>(endpoints.repo.batchDelete, {
        repo_ids: repoIds,
        repo_types: repoTypes,
      }),
  });
}

export function useBatchDeleteStatus(operationId: string | null) {
  return useQuery({
    queryKey: queryKeys.cacheScan.batchDeleteStatus(operationId ?? ''),
    queryFn: () => api.get<BatchDeleteStatusResponse>(endpoints.repo.batchDeleteStatus(operationId!)),
    enabled: !!operationId,
    refetchInterval: (query) =>
      query.state.data?.data?.status === 'completed' ? false : 1000,
  });
}
