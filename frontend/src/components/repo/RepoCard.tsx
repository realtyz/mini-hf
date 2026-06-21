import { useState, useCallback, memo } from 'react'
import {
  Box,
  Database,
  Download,
  GitCommit,
  Copy,
  Check,
  ArrowUpRight,
  Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import type { RepoProfile, RepoStatus } from '@/lib/api/types'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { cn, formatCompactNumber } from '@/lib/utils'
import { motion } from 'framer-motion'

type Accent = 'emerald' | 'slate' | 'sky' | 'amber' | 'red'

const statusTheme: Record<
  RepoStatus,
  {
    accent: Accent
    label: string
    dot: string
    ring: string
    hoverBorder: string
  }
> = {
  active: {
    accent: 'emerald',
    label: '活跃',
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-500/20',
    hoverBorder: 'hover:border-emerald-500/30 dark:hover:border-emerald-500/25',
  },
  inactive: {
    accent: 'slate',
    label: '未就绪',
    dot: 'bg-slate-400',
    ring: 'ring-slate-400/20',
    hoverBorder: 'hover:border-slate-400/40 dark:hover:border-slate-500/30',
  },
  updating: {
    accent: 'sky',
    label: '同步中',
    dot: 'bg-sky-500',
    ring: 'ring-sky-500/20',
    hoverBorder: 'hover:border-sky-500/30 dark:hover:border-sky-500/25',
  },
  cleaning: {
    accent: 'red',
    label: '清理中',
    dot: 'bg-red-500',
    ring: 'ring-red-500/20',
    hoverBorder: 'hover:border-red-500/30 dark:hover:border-red-500/25',
  },
  cleaned: {
    accent: 'amber',
    label: '已清理',
    dot: 'bg-amber-500',
    ring: 'ring-amber-500/20',
    hoverBorder: 'hover:border-amber-500/30 dark:hover:border-amber-500/25',
  },
}

function getRepoTypeIcon(type: string, className?: string) {
  return type === 'model' ? (
    <Box className={className} strokeWidth={1.75} />
  ) : (
    <Database className={className} strokeWidth={1.75} />
  )
}

interface RepoCardProps {
  repo: RepoProfile
  onViewDetail?: () => void
  index?: number
}

export const RepoCard = memo(function RepoCard({
  repo,
  onViewDetail,
  index = 0,
}: RepoCardProps) {
  const [copied, setCopied] = useState(false)
  const status = statusTheme[repo.status]
  const isActive = repo.status === 'active' || repo.status === 'updating'

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      try {
        await navigator.clipboard.writeText(repo.repo_id)
        setCopied(true)
        toast.success('RepoId 已复制')
        setTimeout(() => setCopied(false), 2000)
      } catch {
        toast.error('复制失败')
      }
    },
    [repo.repo_id]
  )

  const handleCardClick = () => {
    onViewDetail?.()
  }

  const lastDownload = repo.last_downloaded_at
    ? formatDistanceToNow(new Date(repo.last_downloaded_at), {
        addSuffix: true,
        locale: zhCN,
      })
    : '从未下载'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: Math.min(index * 0.04, 0.4),
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <Card
        className={cn(
          'group relative cursor-pointer overflow-hidden',
          'border-border/70 bg-card',
          'py-0 gap-0 rounded-2xl',
          'transition-[border-color,box-shadow,transform] duration-300 ease-out',
          status.hoverBorder,
          'hover:-translate-y-0.5',
          'hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.5)]'
        )}
        onClick={handleCardClick}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <div
            className={cn(
              'shrink-0 mt-0.5 flex size-9 items-center justify-center rounded-xl',
              'bg-muted/50 text-muted-foreground',
              'ring-1 ring-inset ring-border/60',
              'transition-colors duration-300',
              'group-hover:bg-primary/5 group-hover:text-foreground'
            )}
          >
            {getRepoTypeIcon(repo.repo_type, 'h-[18px] w-[18px]')}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <h3
                  className="min-w-0 flex-1 truncate font-mono text-[13px] leading-snug font-medium tracking-tight text-foreground"
                  title={repo.repo_id}
                >
                  {repo.repo_id}
                </h3>
                <button
                  onClick={handleCopy}
                  className={cn(
                    'inline-flex shrink-0 items-center justify-center rounded p-0.5',
                    'text-muted-foreground/50 transition-all duration-150',
                    'opacity-0 group-hover:opacity-100',
                    'hover:bg-accent hover:text-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  )}
                  title="复制 RepoId"
                  aria-label="复制 RepoId"
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Copy className="h-3 w-3" strokeWidth={1.75} />
                  )}
                </button>
              </div>
              <ArrowUpRight
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  'text-muted-foreground/40 transition-all duration-300',
                  '-translate-y-0.5 translate-x-0.5 opacity-0',
                  'group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100 group-hover:text-foreground/70'
                )}
              />
            </div>

            {/* Status + tag line */}
            <div className="mt-2 flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className="relative flex size-1.5">
                  {isActive && (
                    <span
                      className={cn(
                        'absolute inline-flex size-full rounded-full opacity-60',
                        status.dot,
                        'animate-ping'
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      'relative inline-flex size-1.5 rounded-full ring-2 ring-card',
                      status.dot
                    )}
                  />
                </span>
                <span className={cn('text-foreground/80')}>{status.label}</span>
              </span>

              {repo.pipeline_tag && (
                <>
                  <span className="h-3 w-px bg-border" aria-hidden />
                  <span className="truncate text-xs text-muted-foreground/70">
                    {repo.pipeline_tag}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Stats footer */}
        <div className="mx-5 border-t border-border/60" />

        <div className="flex items-center gap-4 px-5 py-3.5">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Download className="h-3.5 w-3.5 text-muted-foreground/60" strokeWidth={1.75} />
            <span className="text-xs font-medium tabular-nums text-foreground/80">
              {formatCompactNumber(repo.downloads)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-muted-foreground">
            <GitCommit className="h-3.5 w-3.5 text-muted-foreground/60" strokeWidth={1.75} />
            <span className="text-xs font-medium tabular-nums text-foreground/80">
              {repo.cached_commits}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-1.5 text-muted-foreground/70">
            <Clock className="h-3 w-3 shrink-0" strokeWidth={1.75} />
            <span className="text-[11px] truncate">{lastDownload}</span>
          </div>
        </div>
      </Card>
    </motion.div>
  )
})
