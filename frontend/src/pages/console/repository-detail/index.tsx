import { useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router'
import { Database, Trash2, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
      <div className="container mx-auto flex flex-1 flex-col px-4 py-12 max-w-5xl">
        <nav className="mb-12 flex items-center gap-2 text-[12px]">
          <Link to={backPath} className="text-muted-foreground hover:text-foreground transition-colors">
            仓库
          </Link>
          <span className="text-muted-foreground/30">/</span>
          <span className="text-foreground/80">未找到</span>
        </nav>
        <div className="border-y border-border/60 py-20 text-center">
          <Database className="mx-auto size-5 text-muted-foreground/40 mb-4" />
          <p className="text-[14px] font-medium text-foreground mb-1">加载失败</p>
          <p className="text-[12px] text-muted-foreground">仓库不存在或无法访问</p>
        </div>
      </div>
    )
  }

  const isModel = repo.repo_type === 'model'
  const repoTypeLabel = isModel ? '模型' : '数据集'

  // Split repo id into org/name parts — the typographic hook.
  const slashIdx = repo.repo_id.indexOf('/')
  const orgPart = slashIdx > 0 ? repo.repo_id.slice(0, slashIdx) : null
  const namePart = slashIdx > 0 ? repo.repo_id.slice(slashIdx + 1) : repo.repo_id

  const metrics: { label: string; value: string }[] = [
    { label: '下载量', value: formatCompactNumber(repo.downloads) },
    { label: '缓存版本', value: repo.cached_commits.toString() },
    {
      label: '最近下载',
      value: repo.last_downloaded_at ? format(new Date(repo.last_downloaded_at), 'yyyy-MM-dd') : '—',
    },
    {
      label: '最近更新',
      value: repo.cache_updated_at ? format(new Date(repo.cache_updated_at), 'yyyy-MM-dd') : '—',
    },
  ]

  return (
    <div
      className={cn(
        'container mx-auto flex flex-1 flex-col px-4 py-12 max-w-5xl',
        isLeaving
          ? 'animate-out fade-out slide-out-to-bottom-4 duration-300 fill-mode-forwards'
          : 'animate-in fade-in slide-in-from-bottom-4 duration-300'
      )}
      onAnimationEnd={isLeaving ? () => navigate(backPath) : undefined}
    >
      {/* ─── Breadcrumb (back affordance lives here) ─── */}
      <nav className="mb-12 flex items-center gap-2 text-[12px] min-w-0">
        <Link
          to={backPath}
          onClick={handleBack}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          仓库
        </Link>
        <span className="text-muted-foreground/30 shrink-0">/</span>
        {orgPart && (
          <>
            <span className="text-muted-foreground/70 truncate">{orgPart}</span>
            <span className="text-muted-foreground/30 shrink-0">/</span>
          </>
        )}
        <span className="text-foreground/90 font-medium truncate">{namePart}</span>
      </nav>

      {/* ─── Identity hero ─── */}
      <header className="mb-14 flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold tracking-tight text-[28px] sm:text-[34px] leading-[1.15] break-all">
            {orgPart && (
              <>
                <span className="text-muted-foreground/70 font-normal">{orgPart}</span>
                <span className="mx-1.5 text-muted-foreground/30 font-light">/</span>
              </>
            )}
            <span className="text-foreground">{namePart}</span>
          </h1>

          <div className="mt-5 flex flex-wrap items-center gap-x-3.5 gap-y-2 text-[12px]">
            <span className="inline-flex items-center gap-1.5">
              <span className={cn('size-1.5 rounded-full', getRepoStatusDotClass(repo.status as RepoStatus))} />
              <span className="text-foreground/85 font-medium">{getRepoStatusLabel(repo.status as RepoStatus)}</span>
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
            </span>

            <span className="text-muted-foreground/30">·</span>
            <span className="text-muted-foreground">{repoTypeLabel}</span>

            {repo.pipeline_tag && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="font-mono text-muted-foreground tracking-tight">{repo.pipeline_tag}</span>
              </>
            )}

            <span className="text-muted-foreground/30">·</span>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors group"
              title="复制仓库ID"
            >
              {copied ? (
                <Check className="size-3 text-emerald-500" />
              ) : (
                <Copy className="size-3 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
              )}
              <span className="text-[12px]">{copied ? '已复制' : '复制ID'}</span>
            </button>
          </div>
        </div>

        {showActions && (
          <Button
            variant="ghost"
            size="sm"
            className="text-[12px] text-muted-foreground hover:text-destructive hover:bg-destructive/5 shrink-0 -mr-2"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="size-3.5" />
            删除
          </Button>
        )}
      </header>

      {/* ─── Manifest-style metric strip ─── */}
      <dl className="mb-16 grid grid-cols-2 sm:grid-cols-4 border-y border-border/60 divide-x divide-border/60">
        {metrics.map((m, i) => (
          <div
            key={m.label}
            className={cn(
              'flex flex-col gap-2.5 px-5 py-5',
              // On the 2-col layout, the second row needs a top hairline.
              i >= 2 && 'border-t border-border/60 sm:border-t-0'
            )}
          >
            <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {m.label}
            </dt>
            <dd className="text-[22px] font-medium tabular-nums tracking-tight leading-none text-foreground">
              {m.value}
            </dd>
          </div>
        ))}
      </dl>

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
