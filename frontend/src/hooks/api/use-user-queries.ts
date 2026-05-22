/**
 * 用户管理相关 API Hooks（需要 admin 权限）
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import endpoints from '@/lib/api-endpoints'
import type {
  ApiResponse,
  UserCreateRequest,
  UserListResponse,
  UserResponse,
  UserUpdateRequest,
} from '@/lib/api-types'

/**
 * 获取用户列表（管理员）
 */
export function useUsers(params?: { skip?: number; limit?: number; email_search?: string }) {
  return useQuery({
    queryKey: queryKeys.users.list(params),
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      searchParams.append('skip', String(params?.skip ?? 0))
      searchParams.append('limit', String(params?.limit ?? 20))
      if (params?.email_search) {
        searchParams.append('email_search', params.email_search)
      }

      const url = `${endpoints.user.list}?${searchParams.toString()}`

      const response = await api.get<UserListResponse>(url)
      return response
    },
  })
}

/**
 * 获取单个用户详情（管理员）
 */
export function useUser(userId: number) {
  return useQuery({
    queryKey: queryKeys.users.detail(userId),
    queryFn: async () => {
      const response = await api.get<ApiResponse<UserResponse>>(endpoints.user.detail(userId))
      return response.data
    },
    enabled: !!userId,
  })
}

/**
 * 创建用户（管理员）
 */
export function useCreateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: UserCreateRequest) => {
      const response = await api.post<ApiResponse<UserResponse>>(endpoints.user.create, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
    },
  })
}

/**
 * 更新用户（管理员）
 */
export function useUpdateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      userId,
      data,
    }: {
      userId: number
      data: UserUpdateRequest
    }) => {
      const response = await api.put<ApiResponse<UserResponse>>(
        endpoints.user.update(userId),
        data
      )
      return response.data
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) })
    },
  })
}

/**
 * 删除用户（管理员，软删除）
 */
export function useDeleteUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (userId: number) => {
      const response = await api.delete<ApiResponse<void>>(endpoints.user.delete(userId))
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
    },
  })
}

/**
 * 重置用户密码（管理员）
 */
export function useResetUserPassword() {
  return useMutation({
    mutationFn: async ({
      userId,
      newPassword,
    }: {
      userId: number
      newPassword: string
    }) => {
      const response = await api.post<ApiResponse<string>>(
        endpoints.user.resetPassword(userId),
        { new_password: newPassword }
      )
      return response.data
    },
  })
}
