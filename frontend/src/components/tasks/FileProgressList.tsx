import { useState, useMemo, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Loader2,
  XCircle,
  Pause,
  UploadCloud,
  ChevronDown,
  ChevronRight,
  FileWarning,
  Inbox,
  WifiOff,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { FileProgressItem, FileProgressStatus } from "@/lib/api/types";

export type { FileProgressItem };
import { formatBytes } from "@/lib/utils";

const FILE_LIST_THRESHOLD = 5000;

interface FileStatusConfig {
  /** Sort order within the list (smaller = higher). */
  order: number;
  /** Left border accent class for the row. */
  accent: string;
  /** Progress indicator fill class. */
  progressColor: string;
  /** Summary view: dot color. */
  color: string;
  /** Summary view: stacked-bar segment color. */
  barColor: string;
  /** Summary view: status label. */
  label: string;
}

// 文件状态展示配置单一来源（对标 TASK_STATUS_CONFIG）
const FILE_STATUS_CONFIG: Record<FileProgressStatus, FileStatusConfig> = {
  reconnecting: {
    order: 0,
    accent: "border-l-amber-500",
    progressColor: "bg-amber-500",
    color: "bg-amber-500",
    barColor: "bg-amber-500",
    label: "重连中",
  },
  downloading: {
    order: 1,
    accent: "border-l-blue-500",
    progressColor: "bg-blue-500",
    color: "bg-blue-500",
    barColor: "bg-blue-500",
    label: "下载中",
  },
  uploading: {
    order: 2,
    accent: "border-l-violet-500",
    progressColor: "bg-violet-500",
    color: "bg-violet-500",
    barColor: "bg-violet-500",
    label: "上传中",
  },
  pending: {
    order: 3,
    accent: "border-l-slate-300 dark:border-l-slate-600",
    progressColor: "bg-slate-300 dark:bg-slate-600",
    color: "bg-slate-300 dark:bg-slate-600",
    barColor: "bg-slate-200 dark:bg-slate-700",
    label: "等待中",
  },
  failed: {
    order: 4,
    accent: "border-l-red-500",
    progressColor: "bg-red-500",
    color: "bg-red-500",
    barColor: "bg-red-500",
    label: "失败",
  },
  completed: {
    order: 5,
    accent: "border-l-emerald-500",
    progressColor: "bg-emerald-500",
    color: "bg-emerald-500",
    barColor: "bg-emerald-500",
    label: "已完成",
  },
};

interface FileProgressListProps {
  taskId: number;
  files: FileProgressItem[];
  isRunning: boolean;
}

function formatSpeed(bytesPerSec: number | null | undefined): string {
  if (!bytesPerSec || bytesPerSec <= 0) return "";
  return formatBytes(bytesPerSec) + "/s";
}

// File progress row component — memoized to skip re-render when data hasn't changed
const FileProgressRow = memo(function FileProgressRow({
  file,
}: {
  file: FileProgressItem;
}) {
  const progress =
    file.status === "completed"
      ? 100
      : file.total_bytes > 0
        ? Math.min(
            100,
            Math.round((file.downloaded_bytes / file.total_bytes) * 100),
          )
        : 0;

  const isActive =
    file.status === "downloading" ||
    file.status === "reconnecting" ||
    file.status === "uploading";

  const getStatusIcon = () => {
    switch (file.status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "downloading":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case "reconnecting":
        return <WifiOff className="h-4 w-4 text-amber-500" />;
      case "uploading":
        return (
          <UploadCloud className="h-4 w-4 text-violet-500 animate-bounce" />
        );
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "pending":
      default:
        return <Pause className="h-4 w-4 text-slate-400 dark:text-slate-500" />;
    }
  };

  return (
    <div
      className={`flex items-center gap-3 py-2 px-3 text-sm min-w-0 max-w-full border-l-2 transition-colors duration-200 ${
        FILE_STATUS_CONFIG[file.status].accent
      } ${
        file.status === "uploading"
          ? "bg-violet-50/50 dark:bg-violet-950/20"
          : file.status === "reconnecting"
            ? "bg-amber-50/40 dark:bg-amber-950/20"
            : file.status === "failed"
              ? "bg-red-50/40 dark:bg-red-950/20"
              : "hover:bg-muted/40"
      }`}
    >
      <div className="shrink-0 w-5 flex items-center justify-center">
        {getStatusIcon()}
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 mb-1 min-w-0">
          <span
            className={`truncate min-w-0 ${
              file.status === "completed"
                ? "text-xs text-muted-foreground"
                : "text-xs font-medium"
            }`}
            title={file.path}
          >
            {file.path}
          </span>
          <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
            {isActive
              ? `${formatBytes(file.downloaded_bytes)} / ${formatBytes(file.total_bytes)}`
              : formatBytes(file.total_bytes)}
          </span>
        </div>
        <Progress
          value={progress}
          className="h-1.5 bg-muted w-full"
          indicatorClassName={FILE_STATUS_CONFIG[file.status].progressColor}
        />
        {file.status === "reconnecting" ? (
          <div className="text-xs mt-1 font-medium text-amber-600 dark:text-amber-400">
            重连中…
          </div>
        ) : isActive && file.speed_bytes_per_sec ? (
          <div
            className={`text-xs mt-1 font-medium tabular-nums ${
              file.status === "uploading"
                ? "text-violet-600 dark:text-violet-400"
                : "text-blue-600 dark:text-blue-400"
            }`}
          >
            {formatSpeed(file.speed_bytes_per_sec)}
          </div>
        ) : null}
        {file.status === "failed" && file.error_message ? (
          <div
            className="text-xs text-red-600 dark:text-red-400 mt-1 truncate min-w-0"
            title={file.error_message}
          >
            {file.error_message}
          </div>
        ) : null}
      </div>
      <span
        className={`text-xs shrink-0 tabular-nums w-9 text-right ${
          file.status === "completed"
            ? "text-muted-foreground"
            : "text-foreground font-medium"
        }`}
      >
        {progress}%
      </span>
    </div>
  );
});

/** Summary card shown when file count exceeds the threshold */
function FileProgressSummary({ files }: { files: FileProgressItem[] }) {
  const stats = useMemo(() => {
    const byStatus: Partial<Record<FileProgressStatus, number>> = {};
    let totalBytes = 0;
    let downloadedBytes = 0;
    for (const f of files) {
      byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
      totalBytes += f.total_bytes;
      downloadedBytes += f.downloaded_bytes;
    }
    const overallProgress =
      totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
    return { byStatus, totalBytes, downloadedBytes, overallProgress };
  }, [files]);

  // Stacked bar segments
  const stackedBar = useMemo(() => {
    const segments: { status: FileProgressStatus; width: number; color: string }[] = [];
    for (const [status, { barColor }] of Object.entries(FILE_STATUS_CONFIG)) {
      const count = stats.byStatus[status as FileProgressStatus] ?? 0;
      if (count > 0) {
        segments.push({
          status: status as FileProgressStatus,
          width: (count / files.length) * 100,
          color: barColor,
        });
      }
    }
    return segments;
  }, [stats.byStatus, files.length]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center py-6 px-4"
    >
      <div className="flex items-center gap-2 mb-4 text-muted-foreground">
        <FileWarning className="h-4 w-4" />
        <span className="text-xs">
          文件数量过多（{files.length.toLocaleString()} 个），仅展示汇总统计
        </span>
      </div>

      {/* Overall progress */}
      <div className="w-full max-w-xs mb-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>总进度</span>
          <span className="tabular-nums font-medium text-foreground">
            {stats.overallProgress}%
          </span>
        </div>
        <Progress
          value={stats.overallProgress}
          className="h-2 bg-muted"
          indicatorClassName="bg-blue-500"
        />
        <div className="text-xs text-muted-foreground mt-1.5 text-center tabular-nums">
          {formatBytes(stats.downloadedBytes)} / {formatBytes(stats.totalBytes)}
        </div>
      </div>

      {/* Stacked bar */}
      <div className="w-full max-w-xs mb-5 h-2 rounded-full overflow-hidden flex bg-muted">
        {stackedBar.map((seg) => (
          <div
            key={seg.status}
            className={`h-full ${seg.color} transition-all duration-500`}
            style={{ width: `${seg.width}%` }}
          />
        ))}
      </div>

      {/* Status breakdown */}
      <div className="flex flex-wrap justify-center gap-4 w-full max-w-sm">
        {Object.entries(FILE_STATUS_CONFIG).map(([status, { label, color }]) => {
          const count = stats.byStatus[status as FileProgressStatus] ?? 0;
          if (count === 0) return null;
          return (
            <div key={status} className="flex flex-col items-center gap-1">
              <span className="text-lg font-bold tabular-nums">
                {count.toLocaleString()}
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${color}`}
                />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

/**
 * Per-file progress list — renders one row per file in a task. Owned by
 * {@link TaskFileProgressPanel}; sibling to the aggregate {@link TaskProgressBar}.
 */
export function FileProgressList({
  taskId,
  files,
  isRunning,
}: FileProgressListProps) {
  const [showCompleted, setShowCompleted] = useState(false);
  const [showFailed, setShowFailed] = useState(true);

  // Sort and split files into active (non-completed, non-failed), failed, and completed
  const { activeFiles, failedFiles, completedFiles } = useMemo(() => {
    const sorted = [...files].sort((a, b) => {
      const orderDiff =
        FILE_STATUS_CONFIG[a.status].order - FILE_STATUS_CONFIG[b.status].order;
      if (orderDiff !== 0) return orderDiff;
      return a.path.localeCompare(b.path);
    });

    const active: FileProgressItem[] = [];
    const failed: FileProgressItem[] = [];
    const completed: FileProgressItem[] = [];
    for (const f of sorted) {
      if (f.status === "completed") {
        completed.push(f);
      } else if (f.status === "failed") {
        failed.push(f);
      } else {
        active.push(f);
      }
    }
    return {
      activeFiles: active,
      failedFiles: failed,
      completedFiles: completed,
    };
  }, [files]);

  if (files.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-10 text-muted-foreground"
      >
        <Inbox className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">暂无文件进度数据</p>
        <p className="text-xs mt-1">
          {isRunning ? "等待 Worker 上报进度..." : "任务未在运行"}
        </p>
      </motion.div>
    );
  }

  // When file count exceeds threshold, show summary statistics instead of per-file list
  if (files.length > FILE_LIST_THRESHOLD) {
    return <FileProgressSummary files={files} />;
  }

  return (
    <div className="divide-y divide-border/30 w-full min-w-0 max-w-full overflow-hidden">
      {/* Active files (downloading / uploading / pending) — always visible */}
      {activeFiles.map((file, index) => (
        <motion.div
          key={`${taskId}-${file.path}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.2,
            delay: index * 0.02,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          <FileProgressRow file={file} />
        </motion.div>
      ))}

      {/* Failed files — collapsible, expanded by default */}
      {failedFiles.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowFailed((v) => !v)}
            className="flex items-center gap-2 w-full py-2 px-3 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors cursor-pointer hover:bg-red-50/50 dark:hover:bg-red-950/20"
          >
            {showFailed ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            )}
            <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
            <span>失败</span>
            <span className="tabular-nums">({failedFiles.length})</span>
          </button>
          <AnimatePresence initial={false}>
            {showFailed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                {failedFiles.map((file) => (
                  <FileProgressRow key={`${taskId}-${file.path}`} file={file} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Completed files — collapsed by default */}
      {completedFiles.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowCompleted((v) => !v)}
            className="flex items-center gap-2 w-full py-2 px-3 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer hover:bg-muted/40"
          >
            {showCompleted ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            )}
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <span>已完成</span>
            <span className="tabular-nums">({completedFiles.length})</span>
          </button>
          <AnimatePresence initial={false}>
            {showCompleted && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                {completedFiles.map((file) => (
                  <FileProgressRow key={`${taskId}-${file.path}`} file={file} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}