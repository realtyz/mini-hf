/**
 * 配置管理相关 API Hooks（需要 admin 权限）
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import type {
  ApiResponse,
  ConfigItem,
  ConfigCreateRequest,
  ConfigUpdateRequest,
  ConfigBatchUpdateRequest,
  ConfigListResponse,
  SMTPConfigResponse,
  SMTPTestRequest,
  SMTPTestResponse,
  SMTPSaveRequest,
  HFEndpointConfigResponse,
  HFEndpointSaveRequest,
  NotificationConfigResponse,
  NotificationSaveRequest,
  AnnouncementConfigResponse,
  AnnouncementSaveRequest,
} from '@/lib/api-types'

/**
 * 获取配置列表（管理员）
 */
export function useConfigs(category?: string) {
  return useQuery({
    queryKey: [...queryKeys.configs.list(), category],
    queryFn: async () => {
      const params = category ? `?category=${encodeURIComponent(category)}` : ''
      return api.get<ConfigListResponse>(`/configs${params}`)
    },
  })
}

/**
 * 获取单个配置（管理员）
 */
export function useConfig(key: string) {
  return useQuery({
    queryKey: queryKeys.configs.detail(key),
    queryFn: async () => {
      return api.get<ApiResponse<ConfigItem>>(`/configs/${encodeURIComponent(key)}`)
    },
    enabled: !!key,
  })
}

/**
 * 获取 SMTP 配置（管理员）
 */
export function useSMTPConfig() {
  return useQuery({
    queryKey: [...queryKeys.configs.all, 'smtp'],
    queryFn: async () => {
      return api.get<ApiResponse<SMTPConfigResponse>>('/configs/category/smtp')
    },
  })
}

/**
 * 创建配置（管理员）
 */
export function useCreateConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: ConfigCreateRequest) => {
      return api.post<ApiResponse<ConfigItem>>('/configs', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.all })
    },
  })
}

/**
 * 更新配置（管理员）
 */
export function useUpdateConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      key,
      data,
    }: {
      key: string
      data: ConfigUpdateRequest
    }) => {
      return api.put<ApiResponse<ConfigItem>>(
        `/configs/${encodeURIComponent(key)}`,
        data
      )
    },
    onSuccess: (_, { key }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.detail(key) })
    },
  })
}

/**
 * 批量更新配置（管理员）
 */
export function useBatchUpdateConfigs() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: ConfigBatchUpdateRequest) => {
      return api.put<ConfigListResponse>('/configs/batch', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.all })
    },
  })
}

/**
 * 删除配置（管理员）
 */
export function useDeleteConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (key: string) => {
      return api.delete<ApiResponse<void>>(`/configs/${encodeURIComponent(key)}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.all })
    },
  })
}

/**
 * 初始化默认配置（管理员）
 */
export function useInitializeDefaultConfigs() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      return api.post<ConfigListResponse>('/configs/init')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.all })
    },
  })
}

/**
 * 测试 SMTP 连接（管理员）
 */
export function useTestSMTPConnection() {
  return useMutation({
    mutationFn: async (data: SMTPTestRequest) => {
      return api.post<SMTPTestResponse>('/configs/smtp/test', data)
    },
  })
}

/**
 * 保存 SMTP 配置（管理员）
 */
export function useSaveSMTPConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: SMTPSaveRequest) => {
      return api.put<ApiResponse<SMTPConfigResponse>>('/configs/smtp', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.all })
    },
  })
}

/**
 * 获取 HuggingFace Endpoint 配置（管理员）
 */
export function useHFEndpointConfig() {
  return useQuery({
    queryKey: [...queryKeys.configs.all, 'hf'],
    queryFn: async () => {
      return api.get<ApiResponse<HFEndpointConfigResponse>>('/configs/category/huggingface')
    },
  })
}

/**
 * 保存 HuggingFace Endpoint 配置（管理员）
 */
export function useSaveHFEndpointConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: HFEndpointSaveRequest) => {
      return api.put<ApiResponse<HFEndpointConfigResponse>>('/configs/category/huggingface', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.all })
    },
  })
}

/**
 * 获取通知配置（管理员）
 */
export function useNotificationConfig() {
  return useQuery({
    queryKey: [...queryKeys.configs.all, 'notification'],
    queryFn: async () => {
      return api.get<ApiResponse<NotificationConfigResponse>>('/configs/category/notification')
    },
  })
}

/**
 * 保存通知配置（管理员）
 */
export function useSaveNotificationConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: NotificationSaveRequest) => {
      return api.put<ApiResponse<NotificationConfigResponse>>('/configs/category/notification', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.all })
    },
  })
}

/**
 * 获取公告配置（管理员）
 */
export function useAnnouncementConfig() {
  return useQuery({
    queryKey: [...queryKeys.configs.all, 'announcement'],
    queryFn: async () => {
      return api.get<ApiResponse<AnnouncementConfigResponse>>('/configs/category/announcement')
    },
  })
}

/**
 * 保存公告配置（管理员）
 */
export function useSaveAnnouncementConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: AnnouncementSaveRequest) => {
      return api.put<ApiResponse<AnnouncementConfigResponse>>('/configs/category/announcement', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.all })
    },
  })
}

/**
 * 获取公开公告（无需认证）
 */
export function usePublicAnnouncement() {
  return useQuery({
    queryKey: ['public', 'announcement'],
    queryFn: async () => {
      return api.get<ApiResponse<AnnouncementConfigResponse>>('/health/announcement')
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

/**
 * 获取公开的 HuggingFace Endpoint 配置（无需认证）
 */
export function usePublicHFEndpoints() {
  return useQuery({
    queryKey: ['public', 'hf-endpoints'],
    queryFn: async () => {
      return api.get<ApiResponse<HFEndpointConfigResponse>>('/health/hf-endpoints')
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}
