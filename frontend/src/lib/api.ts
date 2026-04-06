import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { ApiError, ApiResponse } from '@/lib/api-types'
import { useAuthStore } from '@/stores/auth-store'
import { queryClient } from '@/lib/query-client'

/**
 * API 客户端配置
 *
 * 功能：
 * 1. 自动添加 baseURL (从环境变量 VITE_API_BASE_URL 读取)
 * 2. 请求拦截器自动注入 JWT token
 * 3. 响应拦截器处理 401 未授权，自动跳转登录
 * 4. 自动刷新 token (当 token 即将过期时)
 * 5. 直接返回 response.data，简化调用方代码
 */

// 自定义 API 实例类型，响应拦截器会返回 data 而不是 AxiosResponse
interface ApiInstance {
  get<T = unknown>(url: string, config?: Record<string, unknown>): Promise<T>
  post<T = unknown>(url: string, data?: unknown, config?: Record<string, unknown>): Promise<T>
  put<T = unknown>(url: string, data?: unknown, config?: Record<string, unknown>): Promise<T>
  patch<T = unknown>(url: string, data?: unknown, config?: Record<string, unknown>): Promise<T>
  delete<T = unknown>(url: string, config?: Record<string, unknown>): Promise<T>
}

// 刷新 token 的队列
let isRefreshing = false
let refreshSubscribers: ((token: string) => void)[] = []

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

/**
 * 调用刷新 token 接口
 */
async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = useAuthStore.getState()

  if (!refreshToken) {
    return null
  }

  try {
    const response = await axios.post<{
      access_token: string
      token_type: string
      expires_in: number
    }>(
      `${import.meta.env.VITE_API_BASE_URL}/auth/refresh`,
      {},
      {
        headers: {
          Authorization: `Bearer ${refreshToken}`,
        },
      }
    )

    const { access_token, expires_in } = response.data
    useAuthStore.getState().setToken(access_token, expires_in)
    return access_token
  } catch (error) {
    console.error('Failed to refresh token:', error)
    return null
  }
}

/**
 * 订阅 token 刷新
 */
function subscribeTokenRefresh(callback: (token: string) => void) {
  refreshSubscribers.push(callback)
}

/**
 * 通知所有订阅者 token 已刷新
 */
function onTokenRefreshed(newToken: string) {
  refreshSubscribers.forEach((callback) => callback(newToken))
  refreshSubscribers = []
}

// 请求拦截器：添加 JWT token
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // 跳过非认证请求（如刷新 token 本身）
    // @ts-expect-error - skipAuthRefresh 是自定义属性
    if (config.skipAuthRefresh) {
      return config
    }

    const { token, isTokenAboutToExpire } = useAuthStore.getState()

    if (token && config.headers) {
      // 检查 token 是否即将过期，如果是则先刷新
      if (isTokenAboutToExpire(120) && !isRefreshing) {
        isRefreshing = true
        const newToken = await refreshAccessToken()
        isRefreshing = false

        if (newToken) {
          onTokenRefreshed(newToken)
          config.headers.Authorization = `Bearer ${newToken}`
        } else {
          // 刷新失败，登出
          useAuthStore.getState().logout()
          queryClient.clear()
          window.location.href = '/login'
        }
      } else if (isRefreshing) {
        // 正在刷新中，等待新 token
        return new Promise((resolve) => {
          subscribeTokenRefresh((newToken: string) => {
            config.headers.Authorization = `Bearer ${newToken}`
            resolve(config)
          })
        }) as Promise<InternalAxiosRequestConfig>
      } else {
        config.headers.Authorization = `Bearer ${token}`
      }
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器：统一错误处理
api.interceptors.response.use(
  // 直接返回 data 部分
  (response) => response.data,
  // 错误处理
  async (error: AxiosError<ApiResponse<unknown>>) => {
    const responseData = error.response?.data as
      | { detail?: string; message?: string; code?: number }
      | undefined
    const status = error.response?.status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = error.config as any

    // 401 未授权处理
    if (status === 401 && !config?.skipAuthRedirect) {
      const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

      // 如果不是刷新请求且没有重试过，尝试刷新 token
      if (!config?.skipAuthRefresh && !originalRequest._retry) {
        originalRequest._retry = true

        if (isRefreshing) {
          // 等待刷新完成
          return new Promise((resolve) => {
            subscribeTokenRefresh((newToken: string) => {
              originalRequest.headers.Authorization = `Bearer ${newToken}`
              resolve(api(originalRequest))
            })
          })
        }

        isRefreshing = true
        const newToken = await refreshAccessToken()
        isRefreshing = false

        if (newToken) {
          onTokenRefreshed(newToken)
          originalRequest.headers.Authorization = `Bearer ${newToken}`
          return api(originalRequest)
        }
      }

      // 刷新失败或已重试过，登出并跳转
      useAuthStore.getState().logout()
      queryClient.clear()
      window.location.href = '/login'
    }

    // 返回格式化的错误对象
    // FastAPI HTTPException 返回 detail 字段，我们的 API 返回 message 字段
    const apiError: ApiError = {
      code: responseData?.code ?? status ?? -1,
      message: responseData?.detail ?? responseData?.message ?? error.message ?? '请求失败',
    }

    return Promise.reject(apiError)
  }
)

export default api as ApiInstance
