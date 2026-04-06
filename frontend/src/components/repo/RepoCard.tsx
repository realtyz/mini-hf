import { useState, useCallback, memo } from 'react'
import {
  IconBox,
  IconDatabase,
  IconDownload,
  IconGitCommit,
  IconCopy,
  IconCheck,
  IconChevronRight,
  IconClock,
} from '@tabler/icons-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { RepoProfile, RepoStatus } from '@/lib/api-types'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

type SoftColor = 'emerald' | 'slate' | 'sky' | 'amber' | 'red'

const statusTheme: Record<
  RepoStatus,
  {
    color: SoftColor
    label: string
    badgeClass: string
    dotClass: string
    barClass: string
    gradient: string
  }
> = {
  active: {
    color: 'emerald',
    label: '活跃',
    badgeClass:
      'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    dotClass: 'bg-emerald-500',
    barClass: 'bg-emerald-500/80 group-hover:bg-emerald-500',
    gradient:
      'from-emerald-500/8 via-emerald-500/3 to-transparent',
  },
  inactive: {
    color: 'slate',
    label: '非活跃',
    badgeClass:
      'bg-slate-50 text-slate-600 dark:bg-slate-800/50 dark:text-slate-300',
    dotClass: 'bg-slate-400',
    barClass: 'bg-slate-400/80 group-hover:bg-slate-400',
    gradient: 'from-slate-400/8 via-slate-400/3 to-transparent',
  },
  updating: {
    color: 'sky',
    label: '更新中',
    badgeClass:
      'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
    dotClass: 'bg-sky-500',
    barClass: 'bg-sky-500/80 group-hover:bg-sky-500',
    gradient: 'from-sky-500/8 via-sky-500/3 to-transparent',
  },
  cleaning: {
    color: 'red',
    label: '清理中',
    badgeClass:
      'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
    dotClass: 'bg-red-500',
    barClass: 'bg-red-500/80 group-hover:bg-red-500',
    gradient: 'from-red-500/8 via-red-500/3 to-transparent',
  },
  cleaned: {
    color: 'amber',
    label: '已清理',
    badgeClass:
      'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    dotClass: 'bg-amber-500',
    barClass: 'bg-amber-500/80 group-hover:bg-amber-500',
    gradient: 'from-amber-500/8 via-amber-500/3 to-transparent',
  },
}

function getRepoTypeIcon(type: string, className?: string) {
  return type === 'model' ? (
    <IconBox className={className} />
  ) : (
    <IconDatabase className={className} />
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
  const [isHovered, setIsHovered] = useState(false)
  const status = statusTheme[repo.status]

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

  const shouldPulse = repo.status === 'active' || repo.status === 'updating'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: index * 0.05,
        ease: [0.16, 1, 0.3, 1],
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Card
        className={cn(
          'h-full flex flex-col cursor-pointer overflow-hidden relative',
          'transition-all duration-300',
          'hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-black/20',
          'group'
        )}
        onClick={handleCardClick}
      >
        {/* Status indicator bar */}
        <div className={cn('absolute top-0 left-0 right-0 h-0.5 z-10', status.barClass)} />

        {/* Hover gradient background */}
        <div
          className={cn(
            'absolute inset-0 bg-linear-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-300',
            status.gradient
          )}
        />

        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.02] bg-[linear-gradient(rgba(0,0,0,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.1)_1px,transparent_1px)] bg-size-[20px_20px]" />

        {/* Bottom accent line */}
        <motion.div
          className={cn('absolute bottom-0 left-0 right-0 h-0.5', status.dotClass)}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: isHovered ? 1 : 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          style={{ originX: 0 }}
        />

        <CardHeader className="pb-3 pt-5 relative z-10">
          <div className="flex items-start justify-between gap-3">
            {/* Type icon */}
            <motion.div
              className={cn(
                'shrink-0 size-9 rounded-lg flex items-center justify-center',
                'bg-primary/5 group-hover:bg-primary/10 transition-colors duration-200'
              )}
              animate={{ scale: isHovered ? 1.05 : 1 }}
              transition={{ duration: 0.2 }}
            >
              {getRepoTypeIcon(
                repo.repo_type,
                'h-5 w-5 text-primary/70 group-hover:text-primary transition-colors'
              )}
            </motion.div>

            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm font-semibold break-all leading-relaxed group-hover:text-primary transition-colors">
                <span title={repo.repo_id} className="align-middle">
                  {repo.repo_id}
                </span>
                <button
                  onClick={handleCopy}
                  className="inline-flex align-baseline items-center justify-center rounded p-0.5 ml-1 text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring opacity-60 group-hover:opacity-100"
                  title="复制仓库名称"
                >
                  {copied ? (
                    <IconCheck className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <IconCopy className="h-3 w-3" />
                  )}
                </button>
              </CardTitle>
            </div>

            {/* Arrow indicator */}
            <IconChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary/60 group-hover:translate-x-0.5 transition-all duration-200 shrink-0 -translate-x-1 opacity-0 group-hover:opacity-100" />
          </div>

          {/* Status badges */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Badge
              className={cn(
                'text-[11px] px-2 py-0 h-5 font-medium border-0 inline-flex items-center gap-1.5',
                status.badgeClass
              )}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className={cn('relative inline-flex rounded-full h-1.5 w-1.5', status.dotClass)} />
                {shouldPulse && (
                  <span
                    className={cn(
                      'animate-ping absolute inline-flex h-full w-full rounded-full opacity-40',
                      status.dotClass
                    )}
                  />
                )}
              </span>
              {status.label}
            </Badge>
            {repo.pipeline_tag && (
              <Badge
                variant="info"
                className="text-[11px] px-2 py-0 h-5 font-medium border-0 inline-flex items-center"
              >
                {repo.pipeline_tag}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-0 mt-auto pb-5 relative z-10">
          {/* Stats row */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5 group/stat">
              <IconDownload className="h-3.5 w-3.5 text-muted-foreground/50 group-hover/stat:text-primary/60 transition-colors" />
              <span className="text-xs font-medium tabular-nums">
                {formatNumber(repo.downloads)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 group/stat">
              <IconGitCommit className="h-3.5 w-3.5 text-muted-foreground/50 group-hover/stat:text-primary/60 transition-colors" />
              <span className="text-xs font-medium">{repo.cached_commits} 版本</span>
            </div>
          </div>

          {/* Time info */}
          <div className="mt-3 pt-3 border-t border-border/30 flex flex-col justify-center gap-2 text-[11px] text-muted-foreground/70">
            <div className="flex items-center gap-1.5">
              <IconClock className="h-3 w-3 shrink-0" />
              <span className="text-muted-foreground/50">最近下载:</span>
              <span className="font-medium">
                {repo.last_downloaded_at
                  ? format(new Date(repo.last_downloaded_at), 'yyyy-MM-dd HH:mm', {
                      locale: zhCN,
                    })
                  : '-'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
})
