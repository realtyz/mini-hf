import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { ApiError, ApiResponse } from '@/lib/api/types'
import { useAuthStore } from '@/stores/auth-store'
import { queryClient } from '@/lib/query/client'
import { config } from '@/lib/runtime-config'
import { emitAuthLogout } from '@/lib/auth-events'
import endpoints from '@/lib/api/endpoints'

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    skipAuthRefresh?: boolean
    skipAuthRedirect?: boolean
    _retry?: boolean
  }
}

/**
 * API 客户端配置
 *
 * 功能：
 * 1. 自动添加 baseURL (从运行时配置读取)
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

// 正在进行的 token 刷新 Promise，用于并发请求去重
let refreshPromise: Promise<string | null> | null = null

const api = axios.create({
  baseURL: config.API_BASE_URL,
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
    const response = await axios.post<ApiResponse<{
      access_token: string
      refresh_token: string
      token_type: string
      expires_in: number
    }>>(
      `${config.API_BASE_URL}${endpoints.auth.refresh}`,
      {},
      {
        headers: {
          Authorization: `Bearer ${refreshToken}`,
        },
      }
    )

    const { access_token, refresh_token, expires_in } = response.data.data
    useAuthStore.getState().setToken(access_token, expires_in, refresh_token)
    return access_token
  } catch (error) {
    if (import.meta.env.DEV) console.error('Failed to refresh token:', error)
    return null
  }
}

// 请求拦截器：添加 JWT token
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // 跳过非认证请求（如刷新 token 本身）
    if (config.skipAuthRefresh) {
      return config
    }

    const { token, isTokenAboutToExpire } = useAuthStore.getState()

    if (token && config.headers) {
      // 检查 token 是否即将过期，如果是则先刷新
      if (isTokenAboutToExpire(120)) {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null })
        }
        const newToken = await refreshPromise

        if (newToken) {
          config.headers.Authorization = `Bearer ${newToken}`
        } else {
          // 刷新失败，登出
          useAuthStore.getState().logout()
          queryClient.clear()
          emitAuthLogout()
        }
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
      | { code?: number; message?: string; data?: unknown }
      | undefined
    const status = error.response?.status
    const config = error.config

    // 401 未授权处理
    if (status === 401 && !config?.skipAuthRedirect) {
      const originalRequest = error.config

      // 如果不是刷新请求且没有重试过，尝试刷新 token
      if (originalRequest && !config?.skipAuthRefresh && !originalRequest._retry) {
        originalRequest._retry = true

        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null })
        }
        const newToken = await refreshPromise

        if (newToken) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`
          return api(originalRequest)
        }
      }

      // 刷新失败或已重试过，登出并跳转
      useAuthStore.getState().logout()
      queryClient.clear()
      emitAuthLogout()
    }

    // 返回格式化的错误对象
    // 所有 API 错误响应统一使用 {code, message, data} 格式
    const apiError: ApiError = {
      code: responseData?.code ?? status ?? -1,
      message: responseData?.message ?? error.message ?? '请求失败',
    }

    return Promise.reject(apiError)
  }
)

export default api as ApiInstance
