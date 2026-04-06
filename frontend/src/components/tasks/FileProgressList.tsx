import { motion } from "framer-motion";
import { CheckCircle2, Loader2, XCircle, Pause, UploadCloud } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { FileProgressItem } from "@/lib/api-types";

export type { FileProgressItem };
import { formatBytes } from "@/lib/utils";

interface FileProgressListProps {
  taskId: number;
  files: FileProgressItem[];
  isRunning: boolean;
  currentFile?: string | null;
}

function formatSpeed(bytesPerSec: number | null | undefined): string {
  if (!bytesPerSec || bytesPerSec <= 0) return "";
  return formatBytes(bytesPerSec) + "/s";
}

// File progress row component
function FileProgressRow({
  file,
  isCurrent,
  index,
}: {
  file: FileProgressItem;
  isCurrent: boolean;
  index: number;
}) {
  const progress =
    file.status === "completed"
      ? 100
      : file.total_bytes > 0
        ? Math.min(100, Math.round((file.downloaded_bytes / file.total_bytes) * 100))
        : 0;

  const getStatusIcon = () => {
    switch (file.status) {
      case "completed":
        return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
      case "downloading":
        return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />;
      case "uploading":
        return <UploadCloud className="h-3.5 w-3.5 text-violet-500 animate-bounce" />;
      case "failed":
        return <XCircle className="h-3.5 w-3.5 text-red-500" />;
      case "pending":
      default:
        return <Pause className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />;
    }
  };

  const getProgressColor = () => {
    switch (file.status) {
      case "completed":
        return "bg-emerald-500";
      case "downloading":
        return "bg-blue-500";
      case "uploading":
        return "bg-violet-500";
      case "failed":
        return "bg-red-500";
      default:
        return "bg-slate-300 dark:bg-slate-600";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.02, ease: [0.16, 1, 0.3, 1] }}
      className={`group flex items-center gap-3 py-2.5 text-sm transition-colors duration-200 ${
        isCurrent
          ? "bg-blue-50/70 -mx-2 px-2 rounded-md dark:bg-blue-950/30"
          : ""
      } ${
        file.status === "uploading"
          ? "bg-violet-50/60 -mx-2 px-2 rounded-md dark:bg-violet-950/20"
          : ""
      }`}
    >
      <div className="shrink-0 w-5 flex items-center justify-center">
        {getStatusIcon()}
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center justify-between mb-1">
          <span
            className="text-xs truncate group-hover:text-foreground transition-colors"
            title={file.path}
          >
            {file.path}
          </span>
          <span className="text-[10px] text-muted-foreground ml-2 shrink-0 tabular-nums">
            {file.status === "downloading" || file.status === "uploading"
              ? `${formatBytes(file.downloaded_bytes)} / ${formatBytes(file.total_bytes)}`
              : formatBytes(file.total_bytes)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Progress
            value={progress}
            className="h-1 flex-1 bg-muted"
            indicatorClassName={getProgressColor()}
          />
          <span className="text-[10px] text-muted-foreground w-8 text-right tabular-nums">
            {progress}%
          </span>
        </div>
        {(file.status === "downloading" || file.status === "uploading") && file.speed_bytes_per_sec ? (
          <div className={`text-[10px] mt-0.5 font-medium ${
            file.status === "uploading" ? "text-violet-500" : "text-blue-500"
          }`}>
            {formatSpeed(file.speed_bytes_per_sec)}
          </div>
        ) : null}
        {file.status === "failed" && file.error_message ? (
          <div className="text-[10px] text-red-500 mt-0.5 truncate" title={file.error_message}>
            错误: {file.error_message}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

export function FileProgressList({
  taskId,
  files,
  isRunning,
  currentFile,
}: FileProgressListProps) {
  if (files.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-8 text-muted-foreground"
      >
        <p className="text-sm">暂无文件进度数据</p>
        <p className="text-xs mt-1">
          {isRunning ? "等待 Worker 上报进度..." : "任务未在运行"}
        </p>
      </motion.div>
    );
  }

  // Sort by status: downloading > uploading > pending > failed > completed
  const statusOrder: Record<string, number> = {
    downloading: 0,
    uploading: 1,
    pending: 2,
    failed: 3,
    completed: 4,
  };

  const sortedFiles = [...files].sort((a, b) => {
    const orderDiff =
      (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
    if (orderDiff !== 0) return orderDiff;
    return a.path.localeCompare(b.path);
  });

  return (
    <div className="divide-y divide-border/30">
      {sortedFiles.map((file, index) => (
        <FileProgressRow
          key={`${taskId}-${file.path}`}
          file={file}
          isCurrent={file.path === currentFile}
          index={index}
        />
      ))}
    </div>
  );
}

export default FileProgressList;
