import type { TaskResponse } from "@/lib/api/types";
import { formatBytes } from "@/lib/utils";
import { SectionHeader } from "./SectionHeader";

interface StorageStatsConfig {
  storageSectionTitle?: string;
  storageSectionColor?: string;
}

interface StorageStatsSectionProps {
  task: TaskResponse;
  config: StorageStatsConfig;
}

// Private compact stat card — drawer-specific, intentionally not shared.
function TaskStatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border ${accent} p-4 space-y-1`}
    >
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">
        {label}
      </span>
      <p className="text-xl font-bold text-foreground tabular-nums leading-tight">
        {value}
      </p>
      {sub && (
        <p className="text-[12px] text-muted-foreground truncate">{sub}</p>
      )}
    </div>
  );
}

export function StorageStatsSection({ task, config }: StorageStatsSectionProps) {
  const isCompletedState = task.status === "completed";
  const isFailedOrCancelled = task.status === "cancelled" || task.status === "failed";
  const isTerminalState = isCompletedState || isFailedOrCancelled || task.status === "paused";
  const isPendingState = ["pending_approval", "pending"].includes(task.status);

  const displayFileCount =
    isTerminalState && task.downloaded_file_count != null
      ? task.downloaded_file_count
      : task.required_file_count;
  const displayBytes =
    isTerminalState && task.downloaded_bytes != null
      ? task.downloaded_bytes
      : task.required_storage;

  const fileLabel = isPendingState
    ? "预计文件数"
    : isTerminalState
      ? "已下载文件"
      : "文件数";
  const sizeLabel = isPendingState
    ? "预计大小"
    : isTerminalState
      ? "已下载大小"
      : "存储大小";

  return (
    <section>
      <SectionHeader accent={config.storageSectionColor ?? "bg-blue-500"}>
        {config.storageSectionTitle ?? ""}
      </SectionHeader>
      <div className="grid grid-cols-2 gap-3">
        <TaskStatCard
          label={fileLabel}
          value={String(displayFileCount)}
          sub={`共 ${task.total_file_count} 个文件`}
          accent="bg-muted/40 border-border/40"
        />
        <TaskStatCard
          label={sizeLabel}
          value={formatBytes(displayBytes)}
          sub={`共 ${formatBytes(task.total_storage)}`}
          accent="bg-muted/40 border-border/40"
        />
      </div>
    </section>
  );
}
