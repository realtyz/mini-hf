/**
 * 认证相关 API Hooks
 */
import { useMutation, useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import endpoints from '@/lib/api-endpoints'
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
        endpoints.auth.signIn,
        formData.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          // 登录请求不需要自动跳转到登录页
          skipAuthRedirect: true,
        }
      )
      return response.data
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
        endpoints.auth.register,
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
        endpoints.auth.sendVerifyCode,
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
        endpoints.auth.verifyEmail,
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
        endpoints.auth.registerWithCode,
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
        endpoints.auth.verify
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
      const response = await api.get<ApiResponse<UserResponse>>(endpoints.user.me)
      setUser(response.data)
      return response.data
    },
    // 只在已登录时执行
    enabled: !!useAuthStore.getState().token,
  })
}

