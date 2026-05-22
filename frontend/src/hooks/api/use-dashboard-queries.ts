/**
 * Dashboard 专用数据查询 Hooks
 */
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { useTaskList } from "@/hooks/useTaskList";
import type {
  TaskResponse,
  DashboardStatsResponse,
} from "@/lib/api-types";
import api from "@/lib/api";

/**
 * Dashboard 统计数据
 */
export function useDashboardStats() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.dashboard.stats(),
    queryFn: () => api.get<DashboardStatsResponse>("/dashboard/stats"),
    staleTime: 60 * 1000, // 1 minute
  });

  return {
    stats: {
      totalRepos: data?.data?.total_repos ?? 0,
      totalFiles: data?.data?.total_files ?? 0,
      storageCapacity: data?.data?.storage_capacity ?? 0,
      totalDownloads: data?.data?.total_downloads ?? 0,
    },
    isLoading,
  };
}

/**
 * 任务趋势数据（最近7天，仅展示已完成和失败/取消的历史数据）
 */
export interface TaskTrendData {
  date: string;
  completed: number;
  failed: number;
}

export function useTaskTrends() {
  const { data, isLoading } = useTaskList({
    hours: 24 * 7,
    limit: 100,
  });

  const trends: TaskTrendData[] = (() => {
    if (!data?.data) return [];

    const tasks = data.data as TaskResponse[];
    const grouped = new Map<string, { completed: number; failed: number }>();

    // 初始化最近7天的日期
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toLocaleDateString("zh-CN", {
        month: "short",
        day: "numeric",
      });
      grouped.set(dateStr, { completed: 0, failed: 0 });
    }

    // 仅统计已结束的任务（成功、失败/取消）
    tasks.forEach((task: TaskResponse) => {
      const taskDate = new Date(task.created_at);
      const dateStr = taskDate.toLocaleDateString("zh-CN", {
        month: "short",
        day: "numeric",
      });

      if (grouped.has(dateStr)) {
        const stats = grouped.get(dateStr)!;
        switch (task.status) {
          case "completed":
            stats.completed++;
            break;
          case "failed":
          case "cancelled":
            stats.failed++;
            break;
        }
      }
    });

    return Array.from(grouped.entries()).map(([date, stats]) => ({
      date,
      ...stats,
    }));
  })();

  return { trends, isLoading };
}

/**
 * 获取最近任务列表（用于Dashboard表格）
 *
 * 特性：
 * - 当列表中有活跃任务（running/pending/pending_approval/canceling）时，自动每 3 秒轮询
 */
export function useRecentTasks(limit = 10) {
  return useTaskList({
    hours: 24 * 30, // 最近30天
    limit,
    enablePolling: true,
  });
}

