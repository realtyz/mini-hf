import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { UserResponse } from '@/lib/api-types'

/**
 * 认证状态管理
 *
 * 使用 Zustand + persist 中间件实现：
 * - token 持久化到 localStorage
 * - 用户信息保存在内存中（不持久化）
 * - 提供 login/logout/setUser 方法
 */

interface AuthState {
  // State
  token: string | null
  refreshToken: string | null
  user: UserResponse | null
  isAuthenticated: boolean
  tokenExpiresAt: number | null // 过期时间戳（毫秒）

  // Actions
  login: (accessToken: string, refreshToken: string, expiresIn: number) => void
  logout: () => void
  setUser: (user: UserResponse) => void
  setToken: (token: string, expiresIn: number) => void
  isTokenExpired: () => boolean
  isTokenAboutToExpire: (bufferSeconds?: number) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      tokenExpiresAt: null,

      login: (accessToken, refreshToken, expiresIn) =>
        set({
          token: accessToken,
          refreshToken,
          isAuthenticated: true,
          tokenExpiresAt: Date.now() + expiresIn * 1000,
        }),

      logout: () => {
        // 清除所有状态（persist 中间件会自动清除 localStorage）
        set({
          token: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
          tokenExpiresAt: null,
        })
      },

      setUser: (user) =>
        set({
          user,
        }),

      setToken: (token, expiresIn) =>
        set({
          token,
          tokenExpiresAt: Date.now() + expiresIn * 1000,
        }),

      isTokenExpired: () => {
        const { tokenExpiresAt } = get()
        if (!tokenExpiresAt) return true
        return Date.now() >= tokenExpiresAt
      },

      isTokenAboutToExpire: (bufferSeconds = 60) => {
        const { tokenExpiresAt } = get()
        if (!tokenExpiresAt) return true
        return Date.now() >= tokenExpiresAt - bufferSeconds * 1000
      },
    }),
    {
      name: 'auth-storage', // localStorage key
      storage: createJSONStorage(() => localStorage),
      // 持久化 token 和 refreshToken，用户信息不持久化
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        tokenExpiresAt: state.tokenExpiresAt,
      }),
    }
  )
)
