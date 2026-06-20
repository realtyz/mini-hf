import { useState } from 'react'
import { GitCommit, HardDrive, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RepoTreeViewer } from '@/components/repo/RepoTreeViewer'
import { formatBytes } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { SNAPSHOT_STATUS_CONFIG, type SnapshotStatusType } from '@/lib/constants/repo'
import type { RepoDetailResponse, SnapshotStatus } from '@/lib/api/types'
import { StatusEditDialog } from '@/components/shared/StatusEditDialog'
import { useSetSnapshotStatus } from '@/hooks/api/use-repair-mutations'
import { useAuthStore } from '@/stores/auth-store'

interface SnapshotListProps {
  snapshots: RepoDetailResponse['data']['snapshots']
  repoId: string
}

const SNAPSHOT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'active', label: '活跃' },
  { value: 'inactive', label: '未完成' },
  { value: 'archived', label: '已归档' },
]

export function SnapshotList({ snapshots, repoId }: SnapshotListProps) {
  const [expandedSnapshots, setExpandedSnapshots] = useState<Set<number>>(new Set())
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'admin'
  const setSnapshotStatus = useSetSnapshotStatus()

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

  return (
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
              const statusConfig = SNAPSHOT_STATUS_CONFIG[snapshot.status as SnapshotStatusType] ?? SNAPSHOT_STATUS_CONFIG.archived
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
                      <Badge className={statusConfig.className}>
                        {statusConfig.label}
                      </Badge>
                      {isAdmin && (
                        <StatusEditDialog
                          currentStatus={snapshot.status}
                          options={SNAPSHOT_STATUS_OPTIONS}
                          entityLabel="版本状态"
                          isPending={setSnapshotStatus.isPending}
                          onConfirm={(newStatus) =>
                            setSnapshotStatus.mutate({
                              snapshotId: snapshot.id,
                              repoId,
                              status: newStatus as SnapshotStatus,
                            })
                          }
                        />
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="grid transition-all duration-250 ease-out grid-rows-[1fr]">
                      <div className="overflow-hidden border-t border-border/50">
                        <div className="px-4 pb-4 pt-4">
                          <RepoTreeViewer
                            repoId={repoId}
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
  )
}
