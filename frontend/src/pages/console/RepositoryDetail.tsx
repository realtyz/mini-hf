import { useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router'
import { ArrowLeft, Box, Database, Download, GitCommit, ChevronRight, Trash2, Loader2, HardDrive, Calendar, Clock, Copy, Check } from 'lucide-react'
import { RepoTreeViewer } from '@/components/repo-tree-viewer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { RepoDetailResponse } from '@/lib/api-types'
import { formatBytes } from '@/lib/utils'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

async function fetchRepoDetail(repoId: string, repoType: string): Promise<RepoDetailResponse> {
  const endpoint = repoType === 'model'
    ? `/hf_repo/model/${encodeURIComponent(repoId)}`
    : `/hf_repo/dataset/${encodeURIComponent(repoId)}`
  return api.get<RepoDetailResponse>(endpoint)
}

type BadgeVariant = "success" | "neutral" | "info" | "danger";

function getStatusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case 'active':
      return 'success'
    case 'inactive':
      return 'neutral'
    case 'updating':
      return 'info'
    case 'cleaning':
      return 'danger'
    default:
      return 'neutral'
  }
}

function getSnapshotBadgeClass(status: string): string {
  return status === 'active'
    ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'
    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: '活跃',
    inactive: '非活跃',
    updating: '更新中',
    cleaning: '清理中',
  }
  return labels[status] || status
}

function getStatusDotClass(status: string) {
  switch (status) {
    case 'active':
      return 'bg-emerald-500'
    case 'inactive':
      return 'bg-slate-400'
    case 'updating':
      return 'bg-sky-500 animate-pulse'
    case 'cleaning':
      return 'bg-red-500'
    default:
      return 'bg-slate-400'
  }
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

interface RepositoryDetailProps {
  backPath?: string
  showActions?: boolean
}

export function RepositoryDetail({ backPath = '/console/repositories', showActions = true }: RepositoryDetailProps) {
  const [searchParams] = useSearchParams()
  const repoId = searchParams.get('repoId') || ''
  const repoType = searchParams.get('type') || 'model'

  const { data, isLoading, error } = useQuery({
    queryKey: ['repo-detail', repoId, repoType],
    queryFn: () => fetchRepoDetail(repoId, repoType),
    enabled: !!repoId,
  })

  const repo = data?.data.profile
  const snapshots = data?.data.snapshots || []

  const navigate = useNavigate()
  const [isLeaving, setIsLeaving] = useState(false)

  // 对话框状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
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

  const [expandedSnapshots, setExpandedSnapshots] = useState<Set<number>>(new Set())

  const toggleSnapshot = (snapshotId: number) => {
    setExpandedSnapshots((prev) => {
      const next = new Set(prev)
      if (next.has(snapshotId)) {
        next.delete(snapshotId)
      } else {
        next.add(snapshotId)
      }
      return next
    })
  }

  // 删除仓库
  const handleDeleteClick = () => {
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!repo) return
    setIsProcessing(true)
    try {
      const endpoint = `/hf_repo/${encodeURIComponent(repoId)}`
      await api.delete(endpoint)
      toast.success('仓库已删除')
      setDeleteDialogOpen(false)
      setIsLeaving(true)
      setTimeout(() => navigate(backPath), 300)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '删除失败，请重试'
      toast.error(errorMessage)
      setIsProcessing(false)
    }
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

  return (
    <div
      className={`container mx-auto flex flex-1 flex-col px-4 py-8 ${isLeaving ? 'animate-out fade-out slide-out-to-bottom-4 duration-300 fill-mode-forwards' : 'animate-in fade-in slide-in-from-bottom-4 duration-300'}`}
      onAnimationEnd={isLeaving ? () => navigate(backPath) : undefined}
    >
      {/* 返回按钮 */}
      <Link
        to={backPath}
        onClick={handleBack}
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-6 w-fit group"
      >
        <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
        返回仓库列表
      </Link>

      {/* 标题区 - 改进设计 */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            {/* Type icon */}
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
                <Badge variant={getStatusBadgeVariant(repo.status)} className="text-[11px]">
                  <span className={cn("size-1.5 rounded-full mr-1 shrink-0", getStatusDotClass(repo.status))} />
                  {getStatusLabel(repo.status)}
                </Badge>
              </div>
            </div>
          </div>
        </div>
        {showActions && (
          <div className="flex gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="text-[13px] border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 dark:border-red-800/50 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:border-red-700 cursor-pointer"
              onClick={handleDeleteClick}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              删除仓库
            </Button>
          </div>
        )}
      </div>

      {/* 统计卡片 - 重新设计 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard
          icon={<Download className="size-4" />}
          label="下载量"
          value={formatNumber(repo.downloads)}
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

      {/* 版本列表 - 改进设计 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">版本管理</CardTitle>
            <span className="text-xs text-muted-foreground">{snapshots.length} 个版本</span>
          </div>
        </CardHeader>
        <CardContent>
          {snapshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <GitCommit className="size-5 text-muted-foreground/50" />
              </div>
              <p className="text-[13px] text-muted-foreground">暂无版本信息</p>
            </div>
          ) : (
            <div className="space-y-2">
              {snapshots.map((snapshot) => {
                const isExpanded = expandedSnapshots.has(snapshot.id)
                return (
                  <div
                    key={snapshot.id}
                    className={cn(
                      "rounded-xl border overflow-hidden transition-all duration-200",
                      isExpanded ? "border-primary/30 bg-primary/2" : "border-border/60 hover:border-border"
                    )}
                  >
                    <div
                      className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-muted/40 active:bg-muted/60 transition-colors group"
                      onClick={() => toggleSnapshot(snapshot.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={cn(
                          "text-muted-foreground shrink-0 transition-colors",
                          isExpanded && "text-primary"
                        )}>
                          <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-[14px] group-hover:text-primary transition-colors">{snapshot.revision}</div>
                          <div className="text-[12px] text-muted-foreground font-mono truncate max-w-64">
                            {snapshot.commit_hash}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {snapshot.total_size != null && (
                          <div className="hidden sm:flex items-center gap-2 text-[12px] tabular-nums text-muted-foreground">
                            <HardDrive className="size-3" />
                            <span className="font-medium text-foreground/70">{formatBytes(snapshot.cached_size ?? 0)}</span>
                            <span className="opacity-40">/</span>
                            <span>{formatBytes(snapshot.total_size)}</span>
                          </div>
                        )}
                        <Badge className={getSnapshotBadgeClass(snapshot.status)}>
                          {snapshot.status === 'active' ? '活跃' : '已归档'}
                        </Badge>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="grid transition-all duration-250 ease-out grid-rows-[1fr]">
                        <div className="overflow-hidden border-t border-border/50">
                          <div className="px-4 pb-4 pt-4">
                            <RepoTreeViewer
                              repoId={repoId}
                              repoType={repoType}
                              commitHash={snapshot.commit_hash}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 删除仓库确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="sm:max-w-106.25">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-left">确认删除仓库</AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              您即将删除仓库 <span className="font-semibold text-foreground">{repo.repo_id}</span>。此操作不可撤销，所有缓存的文件和版本数据将被永久删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-3 sm:justify-end">
            <AlertDialogCancel
              disabled={isProcessing}
              className="flex-1 sm:flex-initial sm:min-w-25"
            >
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isProcessing}
              className="flex-1 sm:flex-initial sm:min-w-25 border border-red-300 bg-transparent text-red-600 hover:bg-red-50 hover:border-red-400 dark:border-red-800/60 dark:text-red-400 dark:hover:bg-red-950/50"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  删除中...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  确认删除
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// 统计卡片组件
function StatCard({ icon, label, value, colorClass }: { icon: React.ReactNode; label: string; value: string; colorClass?: string }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn("size-9 rounded-lg flex items-center justify-center bg-muted/50", colorClass)}>
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-lg font-bold truncate tabular-nums">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function RepositoryDetailSkeleton() {
  return (
    <div className="container mx-auto flex flex-1 flex-col px-4 py-8">
      <Skeleton className="h-4 w-32 mb-6" />
      <div className="flex items-start gap-3 mb-8">
        <Skeleton className="size-12 rounded-xl shrink-0" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-7 w-64 mb-2" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-19 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  )
}

export default RepositoryDetail
