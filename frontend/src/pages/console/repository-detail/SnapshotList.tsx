import { useState } from 'react'
import { GitCommit, HardDrive, ChevronRight } from 'lucide-react'
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
    <section>
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold tracking-tight">版本管理</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {snapshots.length} 个版本
        </span>
      </div>

      {snapshots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed">
          <div className="size-12 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
            <GitCommit className="size-5 text-muted-foreground/40" />
          </div>
          <p className="text-[13px] text-muted-foreground">暂无版本信息</p>
        </div>
      ) : (
        <div className="rounded-2xl border bg-card/50 overflow-hidden">
          {snapshots.map((snapshot, idx) => {
            const isExpanded = expandedSnapshots.has(snapshot.id)
            const statusConfig =
              SNAPSHOT_STATUS_CONFIG[snapshot.status as SnapshotStatusType] ??
              SNAPSHOT_STATUS_CONFIG.archived
            const isLast = idx === snapshots.length - 1

            return (
              <div key={snapshot.id} className={cn(!isLast && 'border-b border-border/60')}>
                {/* Row header - always visible */}
                <div
                  className="flex items-center justify-between px-4 py-3.5 cursor-pointer select-none hover:bg-muted/30 active:bg-muted/50 transition-colors group"
                  onClick={() => toggleSnapshot(snapshot.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={cn(
                        'text-muted-foreground/40 shrink-0 transition-all duration-200',
                        isExpanded && 'text-foreground/60'
                      )}
                    >
                      <ChevronRight
                        className={cn(
                          'size-4 transition-transform duration-200',
                          isExpanded && 'rotate-90'
                        )}
                      />
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-[14px] tracking-tight group-hover:text-foreground transition-colors">
                        {snapshot.revision}
                      </div>
                      <div className="text-[12px] text-muted-foreground/60 font-mono truncate max-w-64 mt-0.5">
                        {snapshot.commit_hash}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    {snapshot.total_size != null && (
                      <div className="hidden sm:flex items-center gap-1.5 text-[12px] tabular-nums text-muted-foreground/70">
                        <HardDrive className="size-3" />
                        <span className="font-medium text-foreground/70">
                          {formatBytes(snapshot.cached_size ?? 0)}
                        </span>
                        <span className="text-muted-foreground/30">/</span>
                        <span>{formatBytes(snapshot.total_size)}</span>
                      </div>
                    )}
                    <Badge className={statusConfig.className}>{statusConfig.label}</Badge>
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

                {/* Expanded: file tree */}
                {isExpanded && (
                  <div
                    className={cn(
                      'grid transition-all duration-250 ease-out',
                      isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="border-t border-border/30" />
                      <div className="px-4 pb-4 pt-3">
                        <RepoTreeViewer repoId={repoId} commitHash={snapshot.commit_hash} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
