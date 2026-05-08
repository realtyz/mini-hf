import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { ScanResultResponse } from "@/lib/api-types";
import api from "@/lib/api";

export function useCacheScanResult() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.cacheScan.result(),
    queryFn: () => api.get<ScanResultResponse>("/cache/scan/result"),
    staleTime: 5 * 60 * 1000,
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
      api.post<ScanResultResponse>("/cache/scan/run", null, {
        params: { threshold_days: thresholdDays },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.cacheScan.result(), data);
    },
  });

  return mutation;
}
