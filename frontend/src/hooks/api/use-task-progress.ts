import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query/keys";
import { STALE_TIMES } from "@/lib/query/client";
import api from "@/lib/api/client";
import endpoints from "@/lib/api/endpoints";
import type {
  TaskProgressData,
  TaskStatus,
  ApiResponse,
  ApiError,
} from "@/lib/api/types";

/**
 * 获取任务文件级进度
 *
 * - 仅在任务状态为 running 时启用查询
 * - 任务运行时每 3 秒轮询一次
 * - 任务停止后停止轮询
 */
export function useTaskProgress(
  taskId: number | null,
  taskStatus: TaskStatus | undefined,
) {
  const isRunning = taskStatus === "running";

  return useQuery<TaskProgressData>({
    queryKey: queryKeys.tasks.progress(taskId),
    queryFn: async () => {
      if (!taskId) {
        throw new Error("Task ID is required");
      }
      const response = await api.get<ApiResponse<TaskProgressData>>(
        endpoints.task.progress(taskId),
      );
      return response.data;
    },
    enabled: !!taskId && isRunning,
    refetchInterval: () => {
      // 使用传入的 taskStatus 判断，确保第一次就能正确轮询
      // 第一次请求时 query.state.data 为 undefined，不能依赖它判断
      return isRunning ? STALE_TIMES.realtime : false;
    },
    staleTime: STALE_TIMES.realtime,
    retry: (failureCount, error) => {
      // 404 不重试（任务未开始或已完成）。
      // 响应拦截器已把 HTTP 状态写入 ApiError.code，这里直接读取 code。
      if ((error as ApiError).code === 404) {
        return false;
      }
      return failureCount < 3;
    },
  });
}
