import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type { TaskListResponse, TaskListFilters, PaginationParams, TaskStatus } from '@/lib/api-types'

export interface UseTaskListOptions {
  status?: TaskStatus
  source?: string
  repo_type?: string
  search?: string
  hours?: number
  limit?: number
  offset?: number
  /** 是否使用公共API（无需认证）。默认 false，控制台使用认证API */
  public?: boolean
  /** 是否启用自动轮询（当列表中有活跃任务时）。默认 true */
  enablePolling?: boolean
}

interface TaskListParams extends PaginationParams {
  status?: TaskStatus
  hours?: number
  limit?: number
  offset?: number
}

/**
 * 检查任务列表中是否有需要轮询的活跃任务
 * 活跃任务包括：running, pending, pending_approval, canceling
 */
function hasActiveTasks(tasks: TaskListResponse['data'] | undefined): boolean {
  if (!tasks || !Array.isArray(tasks)) return false
  const activeStatuses: TaskStatus[] = ['running', 'pending', 'pending_approval', 'canceling']
  return tasks.some(task => activeStatuses.includes(task.status))
}

/**
 * 获取任务列表
 * 默认使用 /task/list 端点（需要认证），返回所有任务
 * 设置 public: true 时使用 /task/list_public 端点（无需认证），只返回最近 N 小时的任务
 *
 * 特性：
 * - 当列表中有活跃任务（running/pending/pending_approval/canceling）时，自动每 3 秒轮询
 */
export function useTaskList(options: UseTaskListOptions = {}) {
  const { status, source, repo_type, hours = 168, limit = 100, offset = 0, public: isPublic = false, enablePolling = true } = options

  const filters: TaskListFilters = {
    ...(status && { status }),
    ...(source && { source }),
    ...(repo_type && { repo_type }),
  }

  const params: TaskListParams = {
    status,
    hours,
    limit,
    offset,
  }

  const endpoint = isPublic ? '/task/list-public' : '/task/list'

  return useQuery<TaskListResponse>({
    queryKey: queryKeys.tasks.list(filters, params),
    queryFn: async () => {
      const response = await api.get<TaskListResponse>(endpoint, {
        params: isPublic
          ? {
              ...(status && { status }),
              ...(hours && { hours }),
              ...(limit && { limit }),
            }
          : {
              ...(status && { status }),
              ...(limit && { limit }),
              ...(offset && { offset }),
            },
      })
      return response
    },
    // 当列表中有活跃任务时，每 10 秒自动轮询
    refetchInterval: enablePolling
      ? (query) => {
          const data = query.state.data
          return hasActiveTasks(data?.data) ? 10000 : false
        }
      : false,
    // 活跃任务的数据 10 秒后视为过期（以便轮询能正常工作）
    staleTime: enablePolling ? 10000 : 60 * 1000,
  })
}

/**
 * 获取待审批任务数量
 * 用于管理员提示
 */
export function usePendingApprovalCount() {
  const { data } = useTaskList({ status: 'pending_approval', limit: 100 })
  return data?.total ?? 0
}
