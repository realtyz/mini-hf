import { QueryClient } from '@tanstack/react-query'

/**
 * 缓存新鲜时长阶梯（毫秒）
 *
 * - realtime: 活跃任务进度、详情 —— 高频变化数据
 * - list:     任务列表 —— 轮询驱动的列表数据
 * - stats:    仪表盘统计 —— 聚合数据，变化较慢
 * - config:   系统配置 —— 管理员手动修改
 * - static:   公告、端点等公开静态数据
 */
export const STALE_TIMES = {
  realtime: 3 * 1000,
  list: 10 * 1000,
  stats: 60 * 1000,
  config: 5 * 60 * 1000,
  static: 10 * 60 * 1000,
} as const

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIMES.stats,
      refetchOnWindowFocus: false,
      retry: 1,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: false,
    },
  },
})
