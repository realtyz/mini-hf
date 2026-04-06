import type { PaginationParams, TaskListFilters } from './api-types'

export const queryKeys = {
  dashboard: {
    all: ['dashboard'] as const,
    metrics: () => [...queryKeys.dashboard.all, 'metrics'] as const,
    activities: () => [...queryKeys.dashboard.all, 'activities'] as const,
    stats: () => [...queryKeys.dashboard.all, 'stats'] as const,
  },
  auth: {
    all: ['auth'] as const,
    verify: () => [...queryKeys.auth.all, 'verify'] as const,
    me: () => [...queryKeys.auth.all, 'me'] as const,
  },
  users: {
    all: ['users'] as const,
    list: (params?: PaginationParams) =>
      [...queryKeys.users.all, 'list', params] as const,
    detail: (id: number) => [...queryKeys.users.all, 'detail', id] as const,
  },
  tasks: {
    all: ['tasks'] as const,
    list: (filters?: TaskListFilters, params?: PaginationParams) =>
      [...queryKeys.tasks.all, 'list', { filters, params }] as const,
    detail: (id: number | null) =>
      id === null ? ['tasks', 'detail', 'empty'] : [...queryKeys.tasks.all, 'detail', id] as const,
    progress: (id: number | null) =>
      id === null ? ['tasks', 'progress', 'empty'] : [...queryKeys.tasks.all, 'progress', id] as const,
  },
  repos: {
    all: ['repos'] as const,
    list: (params?: PaginationParams) =>
      [...queryKeys.repos.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.repos.all, 'detail', id] as const,
  },
  configs: {
    all: ['configs'] as const,
    list: () => [...queryKeys.configs.all, 'list'] as const,
    detail: (key: string) => [...queryKeys.configs.all, 'detail', key] as const,
  },
} as const
