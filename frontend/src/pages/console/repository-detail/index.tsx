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
import { StatCard } from '@/components/shared/StatCard'
import { getRepoStatusLabel, getRepoStatusDotClass, REPO_STATUS_CONFIG } from '@/lib/constants/repo'
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
          <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <Database className="size-8 text-destructive/60" />
          </div>
          <div className="text-[15px] font-medium text-foreground mb-1">加载失败</div>
          <div className="text-[13px] text-muted-foreground">仓库不存在或无法访问</div>
        </div>
      </div>
    )
  }

  const statusConfig = REPO_STATUS_CONFIG[repo.status as RepoStatus]

  return (
    <div
      className={`container mx-auto flex flex-1 flex-col px-4 py-8 ${isLeaving ? 'animate-out fade-out slide-out-to-bottom-4 duration-300 fill-mode-forwards' : 'animate-in fade-in slide-in-from-bottom-4 duration-300'}`}
      onAnimationEnd={isLeaving ? () => navigate(backPath) : undefined}
    >
      {/* Back button */}
      <Link
        to={backPath}
        onClick={handleBack}
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-6 w-fit group"
      >
        <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
        返回仓库列表
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <div className={cn(
              "size-12 rounded-xl flex items-center justify-center shrink-0",
              "bg-primary/5 border border-primary/10"
            )}>
              {repo.repo_type === 'model' ? (
                <Box className="size-6 text-primary/70" />
              ) : (
                <Database className="size-6 text-primary/70" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight truncate">{repo.repo_id}</h1>
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center justify-center rounded p-1 text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring opacity-60 hover:opacity-100"
                  title="复制仓库ID"
                >
                  {copied ? (
                    <Check className="size-4 text-emerald-500" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </button>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <Badge variant={repo.repo_type === 'model' ? 'info' : 'neutral'} className="text-[11px]">
                  {repo.repo_type === 'model' ? '模型' : '数据集'}
                </Badge>
                {repo.pipeline_tag && (
                  <Badge variant="neutral" className="text-[11px]">{repo.pipeline_tag}</Badge>
                )}
                <Badge variant={statusConfig?.badgeVariant ?? 'neutral'} className="text-[11px]">
                  <span className={cn("size-1.5 rounded-full mr-1 shrink-0", getRepoStatusDotClass(repo.status as RepoStatus))} />
                  {getRepoStatusLabel(repo.status as RepoStatus)}
                </Badge>
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
        </div>
        {showActions && (
          <div className="flex gap-2 shrink-0">
            <Button
              variant="destructive"
              size="sm"
              className="text-[13px] cursor-pointer"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              删除仓库
            </Button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard
          icon={<Download className="size-4" />}
          label="下载量"
          value={formatCompactNumber(repo.downloads)}
          colorClass="text-sky-500"
        />
        <StatCard
          icon={<GitCommit className="size-4" />}
          label="缓存版本"
          value={repo.cached_commits.toString()}
          colorClass="text-violet-500"
        />
        <StatCard
          icon={<Calendar className="size-4" />}
          label="首次缓存"
          value={repo.first_cached_at ? format(new Date(repo.first_cached_at), 'yyyy-MM-dd') : '-'}
          colorClass="text-amber-500"
        />
        <StatCard
          icon={<Clock className="size-4" />}
          label="最近更新"
          value={repo.cache_updated_at ? format(new Date(repo.cache_updated_at), 'yyyy-MM-dd') : '-'}
          colorClass="text-emerald-500"
        />
      </div>

      {/* Snapshot list */}
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
