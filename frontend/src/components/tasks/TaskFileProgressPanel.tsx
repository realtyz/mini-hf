import { motion } from "framer-motion";
import {
  Box,
  Database,
  Smile,
  Globe,
  FileDown,
  Inbox,
  Loader2,
  HardDrive,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FileProgressList } from "./FileProgressList";
import { formatBytes } from "@/lib/utils";
import { useTaskProgress } from "@/hooks/api/use-task-progress";
import { TASK_STATUS_CONFIG } from "@/lib/config/task-status";
import type { TaskResponse } from "@/lib/api/types";

interface TaskFileProgressPanelProps {
  task: TaskResponse | null;
}

/**
 * Top-level progress panel for a task's file downloads. Composes the overall
 * {@link TaskProgressBar} (aggregate bytes) with a {@link FileProgressList}
 * (per-file rows). Hierarchy: TaskFileProgressPanel ▸ TaskProgressBar + FileProgressList.
 */
export function TaskFileProgressPanel({ task }: TaskFileProgressPanelProps) {
  const {
    data: progressData,
    isLoading,
    error,
  } = useTaskProgress(task?.id ?? null, task?.status);

  const progressInfo = progressData;
  const files = progressInfo?.files ?? [];

  // 状态信息（展示属性单一来源：TASK_STATUS_CONFIG）
  const statusInfo = task ? TASK_STATUS_CONFIG[task.status] : null;
  const isRunning = task?.status?.toLowerCase() === "running";

  // 计算进度显示
  const progress = progressInfo
    ? Math.round(progressInfo.progress_percent)
    : task?.total_file_count
      ? Math.round(
          ((task.downloaded_file_count ?? 0) / task.total_file_count) * 100,
        )
      : 0;

  // 文件进度（三层：已下载 / 请求 / 仓库总量）
  const downloadedFiles =
    progressInfo?.downloaded_files ?? task?.downloaded_file_count ?? 0;
  const requiredFiles = task?.required_file_count ?? 0;
  const totalFiles = task?.total_file_count ?? 0;

  // 存储进度（三层：已下载 / 请求 / 仓库总量）
  const downloadedBytes =
    progressInfo?.downloaded_bytes ?? task?.downloaded_bytes ?? 0;
  const requiredBytes = task?.required_storage ?? 0;
  const totalBytes = task?.total_storage ?? 0;

  // 进度百分比
  const storageProgress =
    requiredBytes > 0 ? Math.round((downloadedBytes / requiredBytes) * 100) : 0;
  const fileProgress =
    requiredFiles > 0 ? Math.round((downloadedFiles / requiredFiles) * 100) : 0;

  // 失败文件统计
  const failedFileCount = files.filter((f) => f.status === "failed").length;

  if (!task) {
    return (
      <Card className="h-full min-h-75 border-dashed">
        <CardContent className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/50 mb-4">
            <Inbox className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-foreground">
            选择左侧任务查看文件进度
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            点击任务卡片以查看详情
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full shadow-sm w-full min-w-0 max-w-full overflow-hidden flex flex-col">
      <CardHeader className="pb-3 shrink-0">
        {/* Repo info */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-2 mb-3"
        >
          {task.source === "huggingface" ? (
            <Smile className="h-4 w-4 text-orange-500 shrink-0" />
          ) : (
            <Globe className="h-4 w-4 text-blue-500 shrink-0" />
          )}
          <span className="font-medium truncate" title={task.repo_id}>
            {task.repo_id}
          </span>
          <Badge
            variant={task.repo_type === "model" ? "default" : "secondary"}
            className="shrink-0 text-[10px] px-1.5 py-0 h-4"
          >
            {task.repo_type === "model" ? (
              <Box className="mr-0.5 h-2.5 w-2.5" />
            ) : (
              <Database className="mr-0.5 h-2.5 w-2.5" />
            )}
            {task.repo_type === "model" ? "模型" : "数据集"}
          </Badge>
          <div className="flex-1" />
          <motion.div
            key={progress}
            initial={{ scale: 1.1, opacity: 0.8 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="text-2xl font-bold text-blue-600 dark:text-blue-400 shrink-0 tabular-nums"
          >
            {progress}%
          </motion.div>
        </motion.div>

        {/* Version and status */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <span className="font-mono text-xs">{task.revision}</span>
          {isRunning && (
            <>
              <span className="text-border">|</span>
              <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo?.badgeClass ?? ""}`}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
                </span>
                {statusInfo?.label}
              </motion.span>
            </>
          )}
        </div>

        {/* Stats: Storage and File progress */}
        <div className="grid grid-cols-2 gap-4">
          {/* Storage progress */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <HardDrive className="h-3.5 w-3.5" />
              <span>存储</span>
            </div>
            <Progress
              value={storageProgress}
              className="h-1.5 bg-muted"
              indicatorClassName="bg-blue-500"
            />
            <div className="text-xs">
              <span className="font-medium tabular-nums">
                {formatBytes(downloadedBytes)}
              </span>
              <span className="text-muted-foreground">
                {" "}
                / {formatBytes(requiredBytes)}
              </span>
              {requiredBytes < totalBytes && (
                <span className="text-muted-foreground ml-1 text-[10px]">
                  (仓库 {formatBytes(totalBytes)})
                </span>
              )}
            </div>
          </div>

          {/* File progress */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              <span>文件</span>
            </div>
            <Progress
              value={fileProgress}
              className="h-1.5 bg-muted"
              indicatorClassName="bg-emerald-500"
            />
            <div className="text-xs">
              <span className="font-medium tabular-nums">
                {downloadedFiles}
              </span>
              <span className="text-muted-foreground"> / {requiredFiles}</span>
              {requiredFiles < totalFiles && (
                <span className="text-muted-foreground ml-1 text-[10px]">
                  (仓库共 {totalFiles} 个)
                </span>
              )}
            </div>
            {failedFileCount > 0 && (
              <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 mt-0.5">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span className="tabular-nums">
                  {failedFileCount} 个文件失败
                </span>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="min-w-0 flex-1 min-h-0 flex flex-col">
        <div className="flex items-center gap-2 mb-4 pb-4 border-b min-w-0 shrink-0">
          <FileDown className="h-4 w-4 text-muted-foreground shrink-0" />
          <CardTitle className="text-sm font-medium">文件进度详情</CardTitle>
          {isRunning && !progressData && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-2 shrink-0" />
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-gutter-stable min-w-0">
          {isLoading && !progressData ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm">加载进度...</span>
            </div>
          ) : error && !progressData ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">暂无进度数据</p>
              <p className="text-xs mt-1">
                {task.status === "pending" || task.status === "pending_approval"
                  ? "任务尚未开始"
                  : task.status === "completed"
                    ? "任务已完成"
                    : "无法获取进度"}
              </p>
            </div>
          ) : (
            <FileProgressList
              taskId={task.id}
              files={files}
              isRunning={isRunning}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}