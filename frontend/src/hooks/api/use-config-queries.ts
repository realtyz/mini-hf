/**
 * 配置管理相关 API Hooks（需要 admin 权限）
 *
 * Admin config tabs should use `useConfigForm` from `@/pages/console/settings/use-config-form`
 * which encapsulates the full fetch → edit → save → reset lifecycle.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api/client";
import { queryKeys } from "@/lib/query/keys";
import { STALE_TIMES } from "@/lib/query/client";
import endpoints from "@/lib/api/endpoints";
import type {
  ApiResponse,
  ConfigItem,
  ConfigCreateRequest,
  ConfigUpdateRequest,
  ConfigBatchUpdateRequest,
  ConfigListResponse,
  ConfigSchemaResponse,
  SMTPTestRequest,
  SMTPTestResponse,
  HFEndpointConfigResponse,
  MSEndpointConfigResponse,
  AnnouncementItem,
  AnnouncementCreateRequest,
  AnnouncementUpdateRequest,
} from "@/lib/api/types";

// ═══════════════════════════════════════════════════════════════════════════════
// Generic config CRUD (low-level building blocks)
// ═══════════════════════════════════════════════════════════════════════════════

export function useConfigs(category?: string) {
  return useQuery({
    queryKey: queryKeys.configs.listByCategory(category),
    queryFn: async () => {
      const params = category
        ? `?category=${encodeURIComponent(category)}`
        : "";
      return api.get<ConfigListResponse>(`${endpoints.config.list}${params}`);
    },
  });
}

export function useConfig(key: string) {
  return useQuery({
    queryKey: queryKeys.configs.detail(key),
    queryFn: async () => {
      return api.get<ApiResponse<ConfigItem>>(endpoints.config.detail(key));
    },
    enabled: !!key,
  });
}

export function useCreateConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: ConfigCreateRequest) => {
      return api.post<ApiResponse<ConfigItem>>(endpoints.config.create, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.all });
    },
  });
}

export function useUpdateConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      key,
      data,
    }: {
      key: string;
      data: ConfigUpdateRequest;
    }) => {
      return api.put<ApiResponse<ConfigItem>>(
        endpoints.config.update(key),
        data,
      );
    },
    onSuccess: (_, { key }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.configs.detail(key),
      });
    },
  });
}

export function useBatchUpdateConfigs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: ConfigBatchUpdateRequest) => {
      return api.put<ConfigListResponse>(endpoints.config.batch, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.all });
    },
  });
}

export function useDeleteConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      return api.delete<ApiResponse<void>>(endpoints.config.delete(key));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.all });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMTP-specific
// ═══════════════════════════════════════════════════════════════════════════════

export function useTestSMTPConnection() {
  return useMutation({
    mutationFn: async (data: SMTPTestRequest) => {
      return api.post<SMTPTestResponse>(endpoints.config.smtpTest, data);
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Schema-driven config form
// ═══════════════════════════════════════════════════════════════════════════════

export function useConfigSchema() {
  return useQuery({
    queryKey: queryKeys.configs.schema(),
    queryFn: async () => api.get<ConfigSchemaResponse>(endpoints.config.schema),
    staleTime: STALE_TIMES.config,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Announcement CRUD (System endpoint)
// ═══════════════════════════════════════════════════════════════════════════════

export function useAdminAnnouncements() {
  return useQuery({
    queryKey: queryKeys.announcements.admin(),
    queryFn: async () => {
      const res = await api.get<ApiResponse<AnnouncementItem[]>>(
        endpoints.system.announcementsAdmin,
      );
      return res.data;
    },
    staleTime: STALE_TIMES.config,
  });
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: AnnouncementCreateRequest) => {
      const res = await api.post<ApiResponse<AnnouncementItem>>(
        endpoints.system.announcements,
        data,
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.announcements.all,
      });
    },
  });
}

export function useUpdateAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: { id: number } & AnnouncementUpdateRequest) => {
      const res = await api.put<ApiResponse<AnnouncementItem>>(
        `${endpoints.system.announcements}/${id}`,
        data,
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.announcements.all,
      });
    },
  });
}

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`${endpoints.system.announcements}/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.announcements.all,
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public endpoints (no auth required)
// ═══════════════════════════════════════════════════════════════════════════════

export function useAnnouncementList() {
  return useQuery({
    queryKey: queryKeys.announcements.list(),
    queryFn: async () => {
      return api.get<ApiResponse<AnnouncementItem[]>>(
        endpoints.system.announcements,
      );
    },
    staleTime: STALE_TIMES.static,
  });
}

export function usePublicHFEndpoints() {
  return useQuery({
    queryKey: queryKeys.public.hfEndpoints(),
    queryFn: async () => {
      return api.get<ApiResponse<HFEndpointConfigResponse>>(
        endpoints.health.hfEndpoints,
      );
    },
    staleTime: STALE_TIMES.static,
  });
}

export function usePublicMSEndpoints() {
  return useQuery({
    queryKey: queryKeys.public.msEndpoints(),
    queryFn: async () => {
      return api.get<ApiResponse<MSEndpointConfigResponse>>(
        endpoints.health.msEndpoints,
      );
    },
    staleTime: STALE_TIMES.static,
  });
}
