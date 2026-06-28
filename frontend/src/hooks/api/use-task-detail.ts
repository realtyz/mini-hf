import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { STALE_TIMES } from "@/lib/query/client";
import endpoints from "@/lib/api/endpoints";
import { isActiveStatus } from "@/lib/constants/task-status";
import type { TaskResponse, ApiResponse } from "@/lib/api/types";

/**
 * 获取任务详情
 * 需要 JWT 认证
 * 当任务处于非终态时自动轮询
 */
export function useTaskDetail(taskId: number | null) {
  const { data, isLoading, error, refetch } = useQuery<TaskResponse>({
    queryKey: queryKeys.tasks.detail(taskId),
    queryFn: async () => {
      if (!taskId) throw new Error("Task ID is required");
      const response = await api.get<ApiResponse<TaskResponse>>(
        endpoints.task.detail(taskId),
      );
      return response.data;
    },
    enabled: !!taskId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // 活跃态任务每 3 秒轮询一次（含 pausing，会自动转为 paused）
      if (status && isActiveStatus(status)) {
        return STALE_TIMES.realtime;
      }
      return false;
    },
    refetchOnWindowFocus: false,
    staleTime: STALE_TIMES.realtime,
  });

  return { data, isLoading, error, refetch };
}
