import { QueryClient } from '@tanstack/react-query'

/**
 * TanStack Query 客户端配置
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 数据在 60 秒内被视为新鲜，不重新获取
      staleTime: 60 * 1000,
      // 窗口重新聚焦时不自动刷新
      refetchOnWindowFocus: false,
      // 失败时重试 1 次
      retry: 1,
      // 重试间隔
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      // 失败时不重试
      retry: false,
    },
  },
})
