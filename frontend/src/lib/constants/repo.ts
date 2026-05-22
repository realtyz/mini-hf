import type { RepoStatus } from '@/lib/api/types'

export interface RepoStatusConfig {
  label: string
  dotClass: string
  badgeVariant: 'success' | 'neutral' | 'info' | 'danger'
}

export const REPO_STATUS_CONFIG: Record<RepoStatus, RepoStatusConfig> = {
  active: {
    label: '活跃',
    dotClass: 'bg-emerald-500',
    badgeVariant: 'success',
  },
  inactive: {
    label: '非活跃',
    dotClass: 'bg-slate-400',
    badgeVariant: 'neutral',
  },
  updating: {
    label: '更新中',
    dotClass: 'bg-sky-500 animate-pulse',
    badgeVariant: 'info',
  },
  cleaning: {
    label: '清理中',
    dotClass: 'bg-red-500',
    badgeVariant: 'danger',
  },
  cleaned: {
    label: '已清理',
    dotClass: 'bg-orange-500',
    badgeVariant: 'neutral',
  },
}

export function getRepoStatusLabel(status: RepoStatus): string {
  return REPO_STATUS_CONFIG[status]?.label ?? status
}

export function getRepoStatusDotClass(status: RepoStatus): string {
  return REPO_STATUS_CONFIG[status]?.dotClass ?? 'bg-slate-400'
}

export const SNAPSHOT_STATUS_CONFIG = {
  active: {
    label: '活跃',
    className: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  },
  archived: {
    label: '已归档',
    className: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  },
} as const

export type SnapshotStatusType = keyof typeof SNAPSHOT_STATUS_CONFIG
