/**
 * 认证相关 API Hooks
 */
import { useMutation, useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { useAuthStore } from '@/stores/auth-store'
import type {
  ApiResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterWithCodeRequest,
  SendVerifyCodeRequest,
  SendVerifyCodeResponse,
  TokenVerifyResponse,
  UserResponse,
  VerifyEmailRequest,
  VerifyEmailResponse,
} from '@/lib/api-types'

/**
 * 登录 mutation
 * 成功后自动保存 token 到 auth store
 */
export function useLogin() {
  const login = useAuthStore((state) => state.login)

  return useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      // 后端使用 OAuth2PasswordRequestForm，必须使用 x-www-form-urlencoded
      const formData = new URLSearchParams()
      formData.append('username', credentials.username)
      formData.append('password', credentials.password)

      const response = await api.post<LoginResponse>(
        '/auth/sign-in',
        formData.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          // 登录请求不需要自动跳转到登录页
          skipAuthRedirect: true,
        }
      )
      return response
    },
    onSuccess: (data) => {
      login(data.access_token, data.refresh_token, data.expires_in)
    },
  })
}

/**
 * 注册 mutation
 */
export function useRegister() {
  return useMutation({
    mutationFn: async (data: RegisterRequest) => {
      const response = await api.post<ApiResponse<UserResponse>>(
        '/auth/register',
        data
      )
      return response.data
    },
  })
}

/**
 * 发送验证码 mutation
 */
export function useSendVerifyCode() {
  return useMutation({
    mutationFn: async (data: SendVerifyCodeRequest) => {
      const response = await api.post<ApiResponse<SendVerifyCodeResponse>>(
        '/auth/send-verify-code',
        data
      )
      return response.data
    },
  })
}

/**
 * 验证邮箱 mutation
 */
export function useVerifyEmail() {
  return useMutation({
    mutationFn: async (data: VerifyEmailRequest) => {
      const response = await api.post<ApiResponse<VerifyEmailResponse>>(
        '/auth/verify-email',
        data
      )
      return response.data
    },
  })
}

/**
 * 通过验证码注册 mutation
 */
export function useRegisterWithCode() {
  return useMutation({
    mutationFn: async (data: RegisterWithCodeRequest) => {
      const response = await api.post<ApiResponse<UserResponse>>(
        '/auth/register-with-code',
        data
      )
      return response.data
    },
  })
}

/**
 * 验证当前 token 是否有效
 */
export function useVerifyToken() {
  return useQuery({
    queryKey: queryKeys.auth.verify(),
    queryFn: async () => {
      const response = await api.get<ApiResponse<TokenVerifyResponse>>(
        '/auth/verify'
      )
      return response.data
    },
    // 失败后不重试，避免无限循环
    retry: false,
    // 需要认证，未登录时不执行
    enabled: !!useAuthStore.getState().token,
  })
}

/**
 * 获取当前用户信息
 */
export function useCurrentUser() {
  const setUser = useAuthStore((state) => state.setUser)

  return useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: async () => {
      const response = await api.get<ApiResponse<UserResponse>>('/user/me')
      setUser(response.data)
      return response.data
    },
    // 只在已登录时执行
    enabled: !!useAuthStore.getState().token,
  })
}

/**
 * 更新当前用户信息
 */
export function useUpdateCurrentUser() {
  const setUser = useAuthStore((state) => state.setUser)

  return useMutation({
    mutationFn: async (data: { name?: string }) => {
      const response = await api.put<ApiResponse<UserResponse>>('/user/me', data)
      return response.data
    },
    onSuccess: (data) => {
      setUser(data)
    },
  })
}

/**
 * 修改当前用户密码
 */
export function useUpdatePassword() {
  return useMutation({
    mutationFn: async (data: {
      current_password: string
      new_password: string
    }) => {
      const response = await api.put<ApiResponse<void>>(
        '/user/me/password',
        data
      )
      return response.data
    },
  })
}

/**
 * 刷新 access token
 */
export function useRefreshToken() {
  const setToken = useAuthStore((state) => state.setToken)

  return useMutation({
    mutationFn: async (refreshToken: string) => {
      const response = await api.post<{
        access_token: string
        token_type: string
        expires_in: number
      }>('/auth/refresh', {}, {
        headers: {
          Authorization: `Bearer ${refreshToken}`,
        },
        skipAuthRedirect: true, // 刷新 token 时不需要跳转
      })
      return response
    },
    onSuccess: (data) => {
      setToken(data.access_token, data.expires_in)
    },
  })
}
