import { useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router'
import { ArrowLeft, Box, Database, Download, GitCommit, Trash2, Calendar, Clock, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query/keys'
import api from '@/lib/api/client'
import endpoints from '@/lib/api/endpoints'
import type { RepoDetailResponse } from '@/lib/api/types'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn, formatCompactNumber } from '@/lib/utils'
import { getRepoStatusLabel, getRepoStatusDotClass } from '@/lib/constants/repo'
import { DeleteRepoDialog } from './DeleteRepoDialog'
import { SnapshotList } from './SnapshotList'
import { RepositoryDetailSkeleton } from './RepositoryDetailSkeleton'
import { StatusEditDialog } from '@/components/shared/StatusEditDialog'
import { useSetProfileStatus } from '@/hooks/api/use-repair-mutations'
import { useAuthStore } from '@/stores/auth-store'
import type { RepoStatus } from '@/lib/api/types'

async function fetchRepoDetail(repoId: string, repoType: string): Promise<RepoDetailResponse> {
  const endpoint = repoType === 'model'
    ? endpoints.repo.hfModel(repoId)
    : endpoints.repo.hfDataset(repoId)
  return api.get<RepoDetailResponse>(endpoint)
}

interface RepositoryDetailProps {
  backPath?: string
  showActions?: boolean
}

const PROFILE_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'active', label: '活跃' },
  { value: 'inactive', label: '不完整' },
  { value: 'updating', label: '更新中' },
  { value: 'cleaning', label: '清理中' },
  { value: 'cleaned', label: '已清理' },
]

export function RepositoryDetail({ backPath = '/console/repositories', showActions = true }: RepositoryDetailProps) {
  const [searchParams] = useSearchParams()
  const repoId = searchParams.get('repoId') || ''
  const repoType = searchParams.get('type') || 'model'
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.repos.detail(repoId),
    queryFn: () => fetchRepoDetail(repoId, repoType),
    enabled: !!repoId,
  })

  const repo = data?.data.profile
  const snapshots = data?.data.snapshots || []

  const setProfileStatus = useSetProfileStatus()

  const navigate = useNavigate()
  const [isLeaving, setIsLeaving] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(repoId)
      setCopied(true)
      toast.success('仓库ID已复制')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('复制失败')
    }
  }

  const handleBack = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsLeaving(true)
  }

  const handleDeleted = () => {
    setIsLeaving(true)
    setTimeout(() => navigate(backPath), 300)
  }

  if (isLoading) {
    return <RepositoryDetailSkeleton />
  }

  if (error || !repo) {
    return (
      <div className="container mx-auto flex flex-1 flex-col px-4 py-8">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="size-16 rounded-2xl bg-destructive/5 ring-1 ring-destructive/10 flex items-center justify-center mb-5">
            <Database className="size-7 text-destructive/40" />
          </div>
          <p className="text-[15px] font-medium text-foreground mb-1">加载失败</p>
          <p className="text-[13px] text-muted-foreground">仓库不存在或无法访问</p>
        </div>
      </div>
    )
  }

  const isModel = repo.repo_type === 'model'
  const repoTypeLabel = isModel ? '模型' : '数据集'

  return (
    <div
      className={cn(
        'container mx-auto flex flex-1 flex-col px-4 py-8 max-w-5xl',
        isLeaving
          ? 'animate-out fade-out slide-out-to-bottom-4 duration-300 fill-mode-forwards'
          : 'animate-in fade-in slide-in-from-bottom-4 duration-300'
      )}
      onAnimationEnd={isLeaving ? () => navigate(backPath) : undefined}
    >
      {/* Back */}
      <Link
        to={backPath}
        onClick={handleBack}
        className="group inline-flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-8 w-fit"
      >
        <ArrowLeft className="size-3.5 transition-transform duration-200 group-hover:-translate-x-0.5" />
        返回仓库列表
      </Link>

      {/* ─── Identity block ─── */}
      <div className="flex items-start justify-between gap-6 mb-10">
        <div className="flex items-start gap-4 min-w-0">
          <div
            className={cn(
              'size-14 rounded-2xl flex items-center justify-center shrink-0',
              'bg-gradient-to-br from-primary/5 to-primary/10',
              'ring-1 ring-primary/10'
            )}
          >
            {isModel ? (
              <Box className="size-6 text-primary/50" />
            ) : (
              <Database className="size-6 text-primary/50" />
            )}
          </div>

          <div className="min-w-0 pt-0.5">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight truncate">{repo.repo_id}</h1>
              <button
                onClick={handleCopy}
                className="inline-flex items-center justify-center size-7 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-all duration-150"
                title="复制仓库ID"
              >
                {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-3.5" />}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              <Badge variant="secondary" className="text-[11px] font-medium">
                {repoTypeLabel}
              </Badge>
              {repo.pipeline_tag && (
                <Badge variant="secondary" className="text-[11px] font-medium">
                  {repo.pipeline_tag}
                </Badge>
              )}
              <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <span className={cn('size-1.5 rounded-full', getRepoStatusDotClass(repo.status as RepoStatus))} />
                {getRepoStatusLabel(repo.status as RepoStatus)}
              </span>
              {isAdmin && (
                <StatusEditDialog
                  currentStatus={repo.status}
                  options={PROFILE_STATUS_OPTIONS}
                  entityLabel="仓库状态"
                  isPending={setProfileStatus.isPending}
                  onConfirm={(newStatus) =>
                    setProfileStatus.mutate({
                      repoId,
                      repo_type: repo.repo_type as 'model' | 'dataset',
                      status: newStatus as RepoStatus,
                    })
                  }
                />
              )}
            </div>
          </div>
        </div>

        {showActions && (
          <Button
            variant="ghost"
            size="sm"
            className="text-[13px] text-muted-foreground hover:text-destructive hover:bg-destructive/5 shrink-0"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="size-3.5" />
            删除
          </Button>
        )}
      </div>

      {/* ─── Metrics bar ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 rounded-2xl border bg-card/50 mb-10 overflow-hidden">
        {[
          {
            icon: Download,
            label: '下载量',
            value: formatCompactNumber(repo.downloads),
          },
          {
            icon: GitCommit,
            label: '缓存版本',
            value: repo.cached_commits.toString(),
          },
          {
            icon: Calendar,
            label: '最近下载',
            value: repo.last_downloaded_at
              ? format(new Date(repo.last_downloaded_at), 'yyyy-MM-dd')
              : '-',
          },
          {
            icon: Clock,
            label: '最近更新',
            value: repo.cache_updated_at
              ? format(new Date(repo.cache_updated_at), 'yyyy-MM-dd')
              : '-',
          },
        ].map((metric, i) => (
          <div
            key={metric.label}
            className={cn(
              'flex flex-col items-center justify-center px-4 py-5',
              i > 0 && 'border-l border-border/60'
            )}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <metric.icon className="size-3.5 text-muted-foreground/50" />
              <span className="text-[11px] font-medium text-muted-foreground">{metric.label}</span>
            </div>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{metric.value}</p>
          </div>
        ))}
      </div>

      {/* ─── Version list ─── */}
      <SnapshotList snapshots={snapshots} repoId={repoId} />

      {/* Delete dialog */}
      <DeleteRepoDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        repoId={repoId}
        repoName={repo.repo_id}
        onDeleted={handleDeleted}
      />
    </div>
  )
}

export default RepositoryDetail
