/**
 * 配置管理相关 API Hooks（需要 admin 权限）
 *
 * Admin config tabs should use `useConfigForm` from `@/pages/console/settings/use-config-form`
 * which encapsulates the full fetch → edit → save → reset lifecycle.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { queryKeys } from '@/lib/query-keys'
import { STALE_TIMES } from '@/lib/query-client'
import endpoints from '@/lib/api-endpoints'
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
      return api.get<ConfigListResponse>(`${endpoints.config.list}${params}`)
    },
  })
}

export function useConfig(key: string) {
  return useQuery({
    queryKey: queryKeys.configs.detail(key),
    queryFn: async () => {
      return api.get<ApiResponse<ConfigItem>>(endpoints.config.detail(key))
    },
    enabled: !!key,
  })
}

export function useCreateConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: ConfigCreateRequest) => {
      return api.post<ApiResponse<ConfigItem>>(endpoints.config.create, data)
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
      return api.put<ApiResponse<ConfigItem>>(endpoints.config.update(key), data)
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
      return api.put<ConfigListResponse>(endpoints.config.batch, data)
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
      return api.delete<ApiResponse<void>>(endpoints.config.delete(key))
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
      return api.post<SMTPTestResponse>(endpoints.config.smtpTest, data)
    },
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public endpoints (no auth required)
// ═══════════════════════════════════════════════════════════════════════════════

export function usePublicAnnouncement() {
  return useQuery({
    queryKey: queryKeys.public.announcement(),
    queryFn: async () => {
      return api.get<ApiResponse<AnnouncementConfigResponse>>(endpoints.health.announcement)
    },
    staleTime: STALE_TIMES.static,
  })
}

export function usePublicAnnouncements() {
  return useQuery({
    queryKey: queryKeys.public.announcements(),
    queryFn: async () => {
      return api.get<ApiResponse<AnnouncementItem[]>>(endpoints.system.announcements)
    },
    staleTime: STALE_TIMES.stats,
  })
}

export function usePublicHFEndpoints() {
  return useQuery({
    queryKey: queryKeys.public.hfEndpoints(),
    queryFn: async () => {
      return api.get<ApiResponse<HFEndpointConfigResponse>>(endpoints.health.hfEndpoints)
    },
    staleTime: STALE_TIMES.static,
  })
}
