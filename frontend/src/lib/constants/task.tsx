import type { TaskStatus } from '@/lib/api-types'
import type { ReactNode } from 'react'
import {
  IconClipboardCheck,
  IconClock,
  IconLoader,
  IconCircleCheckFilled,
  IconX,
  IconPlayerPause,
} from '@tabler/icons-react'

export interface TaskStatusConfig {
  label: string
  icon: ReactNode
  // For badge styling
  badgeClass: string
  color?: string
  // For status dot
  dotClass: string
  // For progress bars
  progressBg: string
  progressFill: string
  // For gradients
  gradient: string
}

export const TASK_STATUS_CONFIG: Record<TaskStatus, TaskStatusConfig> = {
  pending_approval: {
    label: '待审批',
    icon: <IconClipboardCheck className="size-3.5" />,
    badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    color: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    dotClass: 'bg-amber-500',
    progressBg: 'bg-amber-100 dark:bg-amber-950/70',
    progressFill: 'bg-amber-500',
    gradient: 'from-amber-500/8 via-amber-500/3 to-transparent',
  },
  pending: {
    label: '等待中',
    icon: <IconClock className="size-3.5" />,
    badgeClass: 'bg-slate-50 text-slate-600 dark:bg-slate-800/50 dark:text-slate-300',
    color: 'bg-slate-50 text-slate-700 dark:bg-slate-950 dark:text-slate-300',
    dotClass: 'bg-slate-400',
    progressBg: 'bg-slate-100 dark:bg-slate-800/70',
    progressFill: 'bg-slate-400',
    gradient: 'from-slate-400/8 via-slate-400/3 to-transparent',
  },
  running: {
    label: '进行中',
    icon: <IconLoader className="size-3.5 animate-spin" />,
    badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
    color: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    dotClass: 'bg-blue-500',
    progressBg: 'bg-blue-100 dark:bg-blue-950/70',
    progressFill: 'bg-blue-500',
    gradient: 'from-blue-500/8 via-blue-500/3 to-transparent',
  },
  completed: {
    label: '已完成',
    icon: <IconCircleCheckFilled className="size-3.5" />,
    badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    dotClass: 'bg-emerald-500',
    progressBg: 'bg-emerald-100 dark:bg-emerald-950/70',
    progressFill: 'bg-emerald-500',
    gradient: 'from-emerald-500/8 via-emerald-500/3 to-transparent',
  },
  failed: {
    label: '失败',
    icon: <IconX className="size-3.5" />,
    badgeClass: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
    color: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
    dotClass: 'bg-red-500',
    progressBg: 'bg-red-100 dark:bg-red-950/70',
    progressFill: 'bg-red-500',
    gradient: 'from-red-500/8 via-red-500/3 to-transparent',
  },
  canceling: {
    label: '取消中',
    icon: <IconPlayerPause className="size-3.5" />,
    badgeClass: 'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300',
    color: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
    dotClass: 'bg-orange-500',
    progressBg: 'bg-orange-100 dark:bg-orange-950/70',
    progressFill: 'bg-orange-500',
    gradient: 'from-orange-500/8 via-orange-500/3 to-transparent',
  },
  cancelled: {
    label: '已取消',
    icon: <IconX className="size-3.5" />,
    badgeClass: 'bg-slate-50 text-slate-600 dark:bg-slate-800/50 dark:text-slate-300',
    color: 'bg-slate-50 text-slate-700 dark:bg-slate-950 dark:text-slate-300',
    dotClass: 'bg-slate-400',
    progressBg: 'bg-slate-100 dark:bg-slate-800/70',
    progressFill: 'bg-slate-400',
    gradient: 'from-slate-400/8 via-slate-400/3 to-transparent',
  },
}

// Helper function to get status config
export function getTaskStatusConfig(status: TaskStatus): TaskStatusConfig {
  return TASK_STATUS_CONFIG[status]
}
