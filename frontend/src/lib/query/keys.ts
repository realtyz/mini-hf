import type {
  PaginationParams,
  TaskListFilters,
  RepoListParams,
} from "@/lib/api/types";

export const queryKeys = {
  dashboard: {
    all: ["dashboard"] as const,
    metrics: () => [...queryKeys.dashboard.all, "metrics"] as const,
    activities: () => [...queryKeys.dashboard.all, "activities"] as const,
    stats: () => [...queryKeys.dashboard.all, "stats"] as const,
  },
  auth: {
    all: ["auth"] as const,
    verify: () => [...queryKeys.auth.all, "verify"] as const,
    me: () => [...queryKeys.auth.all, "me"] as const,
  },
  users: {
    all: ["users"] as const,
    list: (params?: PaginationParams) =>
      [...queryKeys.users.all, "list", params] as const,
    detail: (id: number) => [...queryKeys.users.all, "detail", id] as const,
  },
  tasks: {
    all: ["tasks"] as const,
    active: () => [...queryKeys.tasks.all, "active"] as const,
    recent: (limit: number, hours: number) =>
      [...queryKeys.tasks.all, "recent", { limit, hours }] as const,
    list: (filters?: TaskListFilters, params?: PaginationParams) =>
      [...queryKeys.tasks.all, "list", { filters, params }] as const,
    detail: (id: number | null) =>
      id === null
        ? ["tasks", "detail", "empty"]
        : ([...queryKeys.tasks.all, "detail", id] as const),
    progress: (id: number | null) =>
      id === null
        ? ["tasks", "progress", "empty"]
        : ([...queryKeys.tasks.all, "progress", id] as const),
    previewStatus: (id: string | null) =>
      id === null
        ? ["tasks", "preview-status", "empty"]
        : ([...queryKeys.tasks.all, "preview-status", id] as const),
    retryPreview: (id: number) =>
      [...queryKeys.tasks.all, "retry-preview", id] as const,
  },
  repos: {
    all: ["repos"] as const,
    list: (params?: Partial<RepoListParams & { repoType?: string }>) =>
      [...queryKeys.repos.all, "list", params] as const,
    detail: (id: string) => [...queryKeys.repos.all, "detail", id] as const,
  },
  cacheScan: {
    all: ["cache-scan"] as const,
    result: () => [...queryKeys.cacheScan.all, "result"] as const,
    batchDeleteStatus: (operationId: string) =>
      [...queryKeys.cacheScan.all, "batch-delete-status", operationId] as const,
  },
  configs: {
    all: ["configs"] as const,
    list: () => [...queryKeys.configs.all, "list"] as const,
    schema: () => [...queryKeys.configs.all, "schema"] as const,
    detail: (key: string) => [...queryKeys.configs.all, "detail", key] as const,
  },
  public: {
    all: ["public"] as const,
    announcement: () => [...queryKeys.public.all, "announcement"] as const,
    announcements: () => [...queryKeys.public.all, "announcements"] as const,
    hfEndpoints: () => [...queryKeys.public.all, "hf-endpoints"] as const,
  },
} as const;
