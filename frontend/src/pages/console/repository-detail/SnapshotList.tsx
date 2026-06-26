import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { RepoTreeViewer } from "./RepoTreeViewer";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  SNAPSHOT_STATUS_CONFIG,
  type SnapshotStatusType,
} from "@/lib/constants/repo";
import type { RepoDetailResponse, SnapshotStatus } from "@/lib/api/types";
import { StatusEditDialog } from "./StatusEditDialog";
import { useSetSnapshotStatus } from "@/hooks/api/use-repair-mutations";
import { useAuthStore } from "@/stores/auth-store";

interface SnapshotListProps {
  snapshots: RepoDetailResponse["data"]["snapshots"];
  repoId: string;
}

const SNAPSHOT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "active", label: "活跃" },
  { value: "inactive", label: "未完成" },
  { value: "archived", label: "已归档" },
];

// Single-accent palette: emerald for live, amber for in-flight, muted for archived.
const SNAPSHOT_DOT_CLASS: Record<SnapshotStatusType, string> = {
  active: "bg-emerald-500",
  inactive: "bg-amber-500",
  archived: "bg-muted-foreground/30",
};

export function SnapshotList({ snapshots, repoId }: SnapshotListProps) {
  const [expandedSnapshots, setExpandedSnapshots] = useState<Set<number>>(
    new Set(),
  );
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";
  const setSnapshotStatus = useSetSnapshotStatus();

  const toggleSnapshot = (snapshotId: number) => {
    setExpandedSnapshots((prev) => {
      const next = new Set(prev);
      if (next.has(snapshotId)) {
        next.delete(snapshotId);
      } else {
        next.add(snapshotId);
      }
      return next;
    });
  };

  return (
    <section>
      {/* Section eyebrow */}
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          版本
        </h2>
        <span className="text-[12px] tabular-nums text-muted-foreground/60">
          {snapshots.length} 个
        </span>
      </header>

      {snapshots.length === 0 ? (
        <div className="border-y border-dashed border-border/60 py-20 text-center">
          <p className="text-[13px] text-muted-foreground">暂无版本信息</p>
        </div>
      ) : (
        <div className="border-y border-border/60">
          {snapshots.map((snapshot, idx) => {
            const isExpanded = expandedSnapshots.has(snapshot.id);
            const statusKey =
              (snapshot.status as SnapshotStatusType) in SNAPSHOT_STATUS_CONFIG
                ? (snapshot.status as SnapshotStatusType)
                : "archived";
            const statusLabel = SNAPSHOT_STATUS_CONFIG[statusKey].label;
            const isLast = idx === snapshots.length - 1;

            const total = snapshot.total_size ?? 0;
            const cached = snapshot.cached_size ?? 0;
            const ratio =
              total > 0 ? Math.min(1, Math.max(0, cached / total)) : 0;

            return (
              <div
                key={snapshot.id}
                className={cn(!isLast && "border-b border-border/60")}
              >
                {/* Row — keep as div so admin pencil button doesn't nest in a button */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onClick={() => toggleSnapshot(snapshot.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleSnapshot(snapshot.id);
                    }
                  }}
                  className="flex items-center gap-5 px-2 py-4 cursor-pointer select-none group hover:bg-muted/30 transition-colors outline-none focus-visible:bg-muted/40"
                >
                  <ChevronRight
                    className={cn(
                      "size-3.5 shrink-0 text-muted-foreground/40 transition-all duration-200",
                      "group-hover:text-muted-foreground/80",
                      isExpanded && "rotate-90 text-foreground/70",
                    )}
                  />

                  {/* Revision name + commit hash (mono) */}
                  <div className="min-w-0 flex-1 flex flex-col gap-1">
                    <div className="text-[14px] font-medium tracking-tight truncate text-foreground">
                      {snapshot.revision}
                    </div>
                    <div className="text-[11px] font-mono text-muted-foreground/60 truncate">
                      {snapshot.commit_hash}
                    </div>
                  </div>

                  {/* Cache-completeness bar + byte counts */}
                  {snapshot.total_size != null && (
                    <div className="hidden md:flex items-center gap-3 shrink-0">
                      <div
                        className="h-0.75 w-24 rounded-full bg-border/70 overflow-hidden"
                        aria-label={`已缓存 ${Math.round(ratio * 100)}%`}
                      >
                        <div
                          className={cn(
                            "h-full transition-[width] duration-300",
                            ratio >= 1
                              ? "bg-emerald-500/80"
                              : ratio > 0
                                ? "bg-foreground/70"
                                : "bg-transparent",
                          )}
                          style={{ width: `${ratio * 100}%` }}
                        />
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-muted-foreground/70 min-w-31.5 text-right">
                        <span className="text-foreground/90">
                          {formatBytes(cached)}
                        </span>
                        <span className="mx-1 text-muted-foreground/30">/</span>
                        <span>{formatBytes(total)}</span>
                      </div>
                    </div>
                  )}

                  {/* Status: dot + label, no pill */}
                  <div className="flex items-center gap-1.5 shrink-0 min-w-13">
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        SNAPSHOT_DOT_CLASS[statusKey],
                      )}
                    />
                    <span className="text-[12px] text-foreground/80">
                      {statusLabel}
                    </span>
                  </div>

                  {isAdmin && (
                    <div
                      className="shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
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
                    </div>
                  )}
                </div>

                {/* Expanded file tree */}
                <div
                  className={cn(
                    "grid transition-[grid-template-rows] duration-250 ease-out",
                    isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="px-2 pb-5 pt-1">
                      <RepoTreeViewer
                        repoId={repoId}
                        commitHash={snapshot.commit_hash}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
