/**
 * 用户管理相关 API Hooks（需要 admin 权限）
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  UserCreateRequest,
  UserResponse,
  UserUpdateRequest,
} from '@/lib/api-types'

/**
 * 获取用户列表（管理员）
 */
export function useUsers(pagination?: PaginationParams) {
  return useQuery({
    queryKey: queryKeys.users.list(pagination),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (pagination?.page) params.append('page', String(pagination.page))
      if (pagination?.page_size)
        params.append('page_size', String(pagination.page_size))

      const queryString = params.toString()
      const url = `/user/list${queryString ? `?${queryString}` : ''}`

      const response = await api.get<ApiResponse<PaginatedResponse<UserResponse>>>(url)
      return response.data
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
      const response = await api.get<ApiResponse<UserResponse>>(`/user/${userId}`)
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
      const response = await api.post<ApiResponse<UserResponse>>('/user', data)
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
        `/user/${userId}`,
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
      const response = await api.delete<ApiResponse<void>>(`/user/${userId}`)
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
        `/user/${userId}/reset-password`,
        { new_password: newPassword }
      )
      return response.data
    },
  })
}
