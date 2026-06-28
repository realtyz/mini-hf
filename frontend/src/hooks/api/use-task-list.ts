import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { STALE_TIMES } from "@/lib/query/client";
import endpoints from "@/lib/api/endpoints";
import { isActiveStatus } from "@/lib/constants/task-status";
import type {
  TaskListResponse,
  ActiveTaskListResponse,
  TaskListFilters,
  PaginationParams,
  TaskStatus,
} from "@/lib/api/types";

export interface UseTaskListOptions {
  status?: TaskStatus;
  source?: string;
  repo_type?: string;
  search?: string;
  hours?: number;
  limit?: number;
  skip?: number;
  /** 是否使用公共API（无需认证）。默认 false，控制台使用认证API */
  public?: boolean;
  /** 是否启用自动轮询（当列表中有活跃任务时）。默认 true */
  enablePolling?: boolean;
}

interface TaskListParams extends PaginationParams {
  status?: TaskStatus;
  hours?: number;
  limit?: number;
  skip?: number;
}

/**
 * 检查任务列表中是否有需要轮询的活跃任务
 * 活跃任务包括：running, pending, pending_approval, canceling, pausing
 */
function hasActiveTasks(tasks: TaskListResponse["data"] | undefined): boolean {
  if (!tasks || !Array.isArray(tasks)) return false;
  return tasks.some((task) => isActiveStatus(task.status));
}

/**
 * 获取任务列表
 * 默认使用 /task/list 端点（需要认证），返回所有任务
 * 设置 public: true 时使用 /task/list-public 端点（无需认证），只返回最近 N 小时的任务
 *
 * 特性：
 * - 认证模式（默认）：当列表中有活跃任务时，自动每 10 秒轮询
 * - 公共模式：不轮询（活跃任务的轮询由 useActiveTasks 负责）
 */
export function useTaskList(options: UseTaskListOptions = {}) {
  const {
    status,
    source,
    repo_type,
    hours = 168,
    limit = 100,
    skip = 0,
    public: isPublic = false,
    enablePolling = true,
    search,
  } = options;

  const filters: TaskListFilters = {
    ...(status && { status }),
    ...(source && { source }),
    ...(repo_type && { repo_type }),
    ...(search && { search }),
  };

  const params: TaskListParams = {
    status,
    hours,
    limit,
    skip,
  };

  const endpoint = isPublic ? endpoints.task.listPublic : endpoints.task.list;

  // 公共模式下不轮询（活跃任务由 useActiveTasks 独立轮询）
  // 认证模式下保持原有的活跃任务检测轮询逻辑
  const shouldPoll = enablePolling && !isPublic;

  return useQuery<TaskListResponse>({
    queryKey: queryKeys.tasks.list(filters, params),
    queryFn: async () => {
      const response = await api.get<TaskListResponse>(endpoint, {
        params: isPublic
          ? {
              ...(status !== undefined && { status }),
              ...(hours !== undefined && { hours }),
              ...(limit !== undefined && { limit }),
              ...(search && { search }),
            }
          : {
              ...(status !== undefined && { status }),
              ...(limit !== undefined && { limit }),
              ...(skip !== undefined && { skip }),
              ...(search && { search }),
            },
      });
      return response;
    },
    // 认证模式：当列表中有活跃任务时，每 10 秒自动轮询
    // 公共模式：不轮询（由独立的 useActiveTasks 负责）
    refetchInterval: shouldPoll
      ? (query) => {
          const data = query.state.data;
          return hasActiveTasks(data?.data) ? STALE_TIMES.list : false;
        }
      : false,
    staleTime: isPublic
      ? STALE_TIMES.stats
      : enablePolling
        ? STALE_TIMES.list
        : STALE_TIMES.stats,
  });
}

/**
 * 获取活跃任务列表（running/pending/pending_approval/canceling）
 * 使用专用的 /task/active-public 端点，优化高频轮询
 *
 * 特性：
 * - 每 10 秒自动轮询
 * - 仅返回活跃状态的任务，数据量小
 * - 无分页、无时间窗口
 */
export function useActiveTasks(options: { enablePolling?: boolean } = {}) {
  const { enablePolling = true } = options;

  return useQuery<ActiveTaskListResponse>({
    queryKey: queryKeys.tasks.active(),
    queryFn: async () => {
      const response = await api.get<ActiveTaskListResponse>(
        endpoints.task.activePublic,
      );
      return response;
    },
    refetchInterval: enablePolling ? 10000 : false,
    staleTime: enablePolling ? STALE_TIMES.list : STALE_TIMES.stats,
  });
}

/**
 * 获取待审批任务数量
 * 用于管理员提示
 */
export function usePendingApprovalCount() {
  const { data } = useTaskList({ status: "pending_approval", limit: 100 });
  return data?.total ?? 0;
}
