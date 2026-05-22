import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { STALE_TIMES } from "@/lib/query-client";
import type { ScanResultResponse } from "@/lib/api-types";
import api from "@/lib/api";
import endpoints from "@/lib/api-endpoints";

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
    mutationFn: (thresholdDays: number) =>
      api.post<ScanResultResponse>(endpoints.cache.scanRun, null, {
        params: { threshold_days: thresholdDays },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.cacheScan.result(), data);
    },
  });

  return mutation;
}
