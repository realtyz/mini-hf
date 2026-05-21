/**
 * 配置管理相关 API Hooks（需要 admin 权限）
 *
 * Admin config tabs should use `useConfigForm` from `@/pages/console/settings/use-config-form`
 * which encapsulates the full fetch → edit → save → reset lifecycle.
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
  SMTPTestRequest,
  SMTPTestResponse,
  HFEndpointConfigResponse,
  AnnouncementConfigResponse,
  AnnouncementItem,
} from '@/lib/api-types'

// ═══════════════════════════════════════════════════════════════════════════════
// Generic config CRUD (low-level building blocks)
// ═══════════════════════════════════════════════════════════════════════════════

export function useConfigs(category?: string) {
  return useQuery({
    queryKey: [...queryKeys.configs.list(), category],
    queryFn: async () => {
      const params = category ? `?category=${encodeURIComponent(category)}` : ''
      return api.get<ConfigListResponse>(`/config${params}`)
    },
  })
}

export function useConfig(key: string) {
  return useQuery({
    queryKey: queryKeys.configs.detail(key),
    queryFn: async () => {
      return api.get<ApiResponse<ConfigItem>>(`/config/${encodeURIComponent(key)}`)
    },
    enabled: !!key,
  })
}

export function useCreateConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: ConfigCreateRequest) => {
      return api.post<ApiResponse<ConfigItem>>('/config', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.all })
    },
  })
}

export function useUpdateConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, data }: { key: string; data: ConfigUpdateRequest }) => {
      return api.put<ApiResponse<ConfigItem>>(`/config/${encodeURIComponent(key)}`, data)
    },
    onSuccess: (_, { key }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.detail(key) })
    },
  })
}

export function useBatchUpdateConfigs() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: ConfigBatchUpdateRequest) => {
      return api.put<ConfigListResponse>('/config/batch', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.all })
    },
  })
}

export function useDeleteConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (key: string) => {
      return api.delete<ApiResponse<void>>(`/config/${encodeURIComponent(key)}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.all })
    },
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMTP-specific
// ═══════════════════════════════════════════════════════════════════════════════

export function useTestSMTPConnection() {
  return useMutation({
    mutationFn: async (data: SMTPTestRequest) => {
      return api.post<SMTPTestResponse>('/config/category/smtp/test', data)
    },
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public endpoints (no auth required)
// ═══════════════════════════════════════════════════════════════════════════════

export function usePublicAnnouncement() {
  return useQuery({
    queryKey: ['public', 'announcement'],
    queryFn: async () => {
      return api.get<ApiResponse<AnnouncementConfigResponse>>('/health/announcement')
    },
    staleTime: 1000 * 60 * 5,
  })
}

export function usePublicAnnouncements() {
  return useQuery({
    queryKey: ['public', 'announcements'],
    queryFn: async () => {
      return api.get<ApiResponse<AnnouncementItem[]>>('/system/announcements')
    },
    staleTime: 1000 * 60 * 2,
  })
}

export function usePublicHFEndpoints() {
  return useQuery({
    queryKey: ['public', 'hf-endpoints'],
    queryFn: async () => {
      return api.get<ApiResponse<HFEndpointConfigResponse>>('/health/hf-endpoints')
    },
    staleTime: 1000 * 60 * 5,
  })
}
