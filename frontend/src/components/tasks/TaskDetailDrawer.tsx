import {
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  FileStack,
  XOctagon,
  Clock,
  Hash,
  GitCommit,
  User,
  Globe,
  Box,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TaskStatusBadge } from "./TaskStatusBadge";
import { TaskProgressBar } from "./TaskProgressBar";
import { PreviewFileTree } from "./PreviewFileTree";
import { FileProgressList } from "./FileProgressList";
import { useTaskDetail } from "@/hooks/useTaskDetail";
import type { PreviewItem, TaskStatus, TaskResponse } from "@/lib/api-types";
import { useTaskProgress } from "@/hooks/useTaskProgress";
import { useTaskActions } from "@/hooks/useTaskActions";
import { useAuthStore } from "@/stores/auth-store";
import { formatBytes } from "@/lib/utils";
import { useState } from "react";

interface TaskDetailDrawerProps {
  taskId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// 状态展示配置
const statusDisplayConfig: Record<
  TaskStatus,
  {
    /** 文件列表标题 */
    fileListTitle: string;
    /** 存储/进度区域标题（仅 showStorageStats 或 running 状态使用） */
    storageSectionTitle?: string;
    /** 存储/进度区域颜色标识（仅 showStorageStats 或 running 状态使用） */
    storageSectionColor?: string;
    /** 是否显示存储统计（文件数/大小） */
    showStorageStats: boolean;
    /** 是否显示实时进度（需要轮询） */
    showRealtimeProgress: boolean;
    /** 底部操作类型 */
    bottomActionType: "none" | "refresh" | "view-progress";
  }
> = {
  pending_approval: {
    fileListTitle: "请求文件列表",
    storageSectionTitle: "统计数据",
    storageSectionColor: "bg-amber-500",
    showStorageStats: true,
    showRealtimeProgress: false,
    bottomActionType: "none",
  },
  pending: {
    fileListTitle: "请求文件列表",
    storageSectionTitle: "统计数据",
    storageSectionColor: "bg-blue-500",
    showStorageStats: true,
    showRealtimeProgress: false,
    bottomActionType: "refresh",
  },
  running: {
    fileListTitle: "请求文件列表",
    storageSectionTitle: "下载进度",
    storageSectionColor: "bg-blue-500",
    showStorageStats: false,
    showRealtimeProgress: true,
    bottomActionType: "view-progress",
  },
  completed: {
    fileListTitle: "请求文件列表",
    storageSectionTitle: "统计数据",
    storageSectionColor: "bg-blue-500",
    showStorageStats: true,
    showRealtimeProgress: false,
    bottomActionType: "none",
  },
  failed: {
    fileListTitle: "请求文件列表",
    showStorageStats: false,
    showRealtimeProgress: false,
    bottomActionType: "none",
  },
  canceling: {
    fileListTitle: "请求文件列表",
    showStorageStats: false,
    showRealtimeProgress: false,
    bottomActionType: "none",
  },
  cancelled: {
    fileListTitle: "请求文件列表",
    showStorageStats: false,
    showRealtimeProgress: false,
    bottomActionType: "none",
  },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("zh-CN");
}

function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    huggingface: "HuggingFace",
    modelscope: "ModelScope",
  };
  return labels[source] || source;
}

function getRepoTypeLabel(repoType: string): string {
  const labels: Record<string, string> = {
    model: "模型",
    dataset: "数据集",
  };
  return labels[repoType] || repoType;
}

function buildTimeline(t: TaskResponse): { label: string; value: string }[] {
  const items: { label: string; value: string }[] = [];
  items.push({ label: "创建时间", value: formatDate(t.created_at) });
  if (t.reviewed_at) items.push({ label: "审批时间", value: formatDate(t.reviewed_at) });
  if (t.started_at) items.push({ label: "开始时间", value: formatDate(t.started_at) });
  if (t.completed_at) items.push({ label: "完成时间", value: formatDate(t.completed_at) });
  items.push({ label: "更新时间", value: formatDate(t.updated_at) });
  return items;
}

// Section header with accent bar
function SectionHeader({
  children,
  accent = "bg-primary",
  badge,
}: {
  children: React.ReactNode;
  accent?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span className={`w-0.75 h-4 ${accent} rounded-full shrink-0`} />
      <h4 className="text-[13px] font-semibold text-foreground tracking-tight">
        {children}
      </h4>
      {badge && <span className="ml-auto">{badge}</span>}
    </div>
  );
}

// Info row for key-value display
function InfoRow({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-0">
      {icon && (
        <span className="mt-0.5 shrink-0 text-muted-foreground/60">{icon}</span>
      )}
      <span className="text-[13px] text-muted-foreground font-medium w-20 shrink-0 leading-5">
        {label}
      </span>
      <div className="flex-1 text-[13px] text-foreground leading-5 min-w-0">
        {children}
      </div>
    </div>
  );
}

// Stat card component
function StatCard({
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

// Timeline item for dates
function TimelineItem({
  label,
  value,
  isLast = false,
}: {
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 transition-colors duration-200 ${isLast ? "bg-foreground/40" : "bg-border"}`} />
        {!isLast && <div className="w-px flex-1 bg-border/50 mt-1" />}
      </div>
      <div className={isLast ? "" : "pb-3"}>
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
          {label}
        </span>
        <span className="text-[13px] text-foreground">{value}</span>
      </div>
    </div>
  );
}

// 状态提示组件
function StatusAlertBanner({ status }: { status: TaskStatus }) {
  if (status === "canceling") {
    return (
      <Alert className="border-orange-200/60 bg-orange-50/60 dark:bg-orange-950/20 dark:border-orange-800/40 rounded-xl py-3">
        <Clock className="h-4 w-4 text-orange-500 dark:text-orange-400 animate-pulse" />
        <AlertDescription className="ml-2 text-orange-800 dark:text-orange-200 font-medium text-[13px]">
          正在取消任务，请稍候...
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

// 存储/进度统计信息组件
function StorageStatsSection({
  task,
  config,
}: {
  task: TaskResponse;
  config: (typeof statusDisplayConfig)[TaskStatus];
}) {
  const isCompletedState = task.status === "completed";
  const isFailedOrCancelled = task.status === "cancelled" || task.status === "failed";
  const isTerminalState = isCompletedState || isFailedOrCancelled;
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
        <StatCard
          label={fileLabel}
          value={String(displayFileCount)}
          sub={`共 ${task.total_file_count} 个文件`}
          accent="bg-muted/40 border-border/40"
        />
        <StatCard
          label={sizeLabel}
          value={formatBytes(displayBytes)}
          sub={`共 ${formatBytes(task.total_storage)}`}
          accent="bg-muted/40 border-border/40"
        />
      </div>
    </section>
  );
}

export function TaskDetailDrawer({
  taskId,
  open,
  onOpenChange,
}: TaskDetailDrawerProps) {
  const { data: task, isLoading, refetch: refetchTask } = useTaskDetail(taskId);
  const { data: progress } = useTaskProgress(
    taskId,
    task?.status === "running",
  );
  const { reviewTask, cancelTask } = useTaskActions();
  const [rejectNotes, setRejectNotes] = useState("");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";

  const canCancel = task ? isAdmin || user?.id === task.creator_user_id : false;

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      reviewTask.reset();
      setRejectNotes("");
      setCancelDialogOpen(false);
    }
    onOpenChange(isOpen);
  };

  const handleApprove = () => {
    if (!taskId) return;
    reviewTask.mutate({ taskId, approved: true });
  };

  const handleReject = () => {
    if (!taskId) return;
    reviewTask.mutate({ taskId, approved: false, notes: rejectNotes || "审批拒绝" });
  };

  const handleCancelClick = () => {
    setCancelDialogOpen(true);
  };

  const handleCancelConfirm = () => {
    if (!taskId) return;
    setCancelDialogOpen(false);
    cancelTask.mutate(taskId, {
      onSuccess: () => refetchTask(),
    });
  };

  const statusConfig = task ? statusDisplayConfig[task.status] : null;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-130 p-0 flex flex-col overflow-hidden">
        {/* Header */}
        <SheetHeader className="px-6 pt-5 pb-4 border-b bg-background shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-base font-semibold leading-none">
                  任务详情
                </SheetTitle>
                {task && <TaskStatusBadge status={task.status} />}
              </div>
              {task && (
                <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground font-mono">
                  <Hash className="h-3 w-3" />
                  <span>{task.id}</span>
                  <ChevronRight className="h-3 w-3 opacity-40" />
                  <span className="truncate max-w-60 font-sans font-medium text-foreground/70">
                    {task.repo_id}
                  </span>
                </div>
              )}
            </div>
          </div>
          <SheetDescription className="sr-only">查看任务详细信息</SheetDescription>
        </SheetHeader>

        {/* Body */}
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex items-center gap-2.5 text-muted-foreground text-sm">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>加载中...</span>
            </div>
          </div>
        ) : task && statusConfig ? (
            <div className="px-6 py-5 space-y-6 overflow-scroll">
              {/* Status banners */}
              <StatusAlertBanner status={task.status} />

              {/* Approval action */}
              {task.status === "pending_approval" && isAdmin && (
                <Alert className="border-amber-200/60 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800/40 rounded-xl py-3">
                  <AlertCircle className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                  <AlertTitle className="text-[13px] font-semibold text-amber-900 dark:text-amber-100">
                    等待审批
                  </AlertTitle>
                  <AlertDescription className="mt-1.5 space-y-2.5">
                    <p className="text-[13px] text-amber-700 dark:text-amber-300">
                      请选择是否批准该任务
                    </p>
                    <textarea
                      value={rejectNotes}
                      onChange={(e) => setRejectNotes(e.target.value)}
                      placeholder="拒绝原因（可选）"
                      rows={2}
                      className="w-full rounded-md border border-amber-200 dark:border-amber-700 bg-white dark:bg-amber-950/30 px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                    <div className="flex gap-2 justify-end w-full">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleReject}
                        disabled={reviewTask.isPending}
                        className="h-7 text-[12px] border-red-200 hover:bg-red-50 hover:text-red-600 active:bg-red-100 dark:border-red-800/50 dark:hover:bg-red-950/40 dark:active:bg-red-950/60"
                      >
                        <XCircle className="mr-1 h-3.5 w-3.5" />
                        拒绝
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleApprove}
                        disabled={reviewTask.isPending}
                        className="h-7 text-[12px] bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white"
                      >
                        <CheckCircle className="mr-1 h-3.5 w-3.5" />
                        批准
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Basic info */}
              <section>
                <SectionHeader accent="bg-primary">基本信息</SectionHeader>
                <div className="rounded-xl border border-border/50 bg-muted/20 divide-y divide-border/40 px-4">
                  <InfoRow
                    icon={<Globe className="h-3.5 w-3.5" />}
                    label="来源"
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        {getSourceLabel(task.source)}
                      </span>
                      <span className="text-muted-foreground/40 text-xs">/</span>
                      <Badge variant={task.repo_type === "model" ? "info" : "neutral"}>
                        {getRepoTypeLabel(task.repo_type)}
                      </Badge>
                    </div>
                  </InfoRow>

                  <InfoRow
                    icon={<Box className="h-3.5 w-3.5" />}
                    label="仓库"
                  >
                    <span className="font-semibold text-foreground break-all">
                      {task.repo_id}
                    </span>
                  </InfoRow>

                  <InfoRow
                    icon={<Hash className="h-3.5 w-3.5" />}
                    label="版本"
                  >
                    <code className="font-mono text-[12px] bg-muted px-1.5 py-0.5 rounded text-foreground/80">
                      {task.revision}
                    </code>
                  </InfoRow>

                  {task.source === "huggingface" && (
                    <InfoRow
                      icon={<Globe className="h-3.5 w-3.5" />}
                      label="HF Endpoint"
                    >
                      <span className="text-foreground text-[13px]">
                        {task.hf_endpoint || "默认ENDPOINT"}
                      </span>
                    </InfoRow>
                  )}

                  {task.commit_hash && (
                    <InfoRow
                      icon={<GitCommit className="h-3.5 w-3.5" />}
                      label="Commit"
                    >
                      <code className="font-mono text-[12px] bg-muted px-1.5 py-0.5 rounded text-foreground/80 break-all">
                        {task.commit_hash}
                      </code>
                    </InfoRow>
                  )}

                  {task.creator_user && (
                    <InfoRow
                      icon={<User className="h-3.5 w-3.5" />}
                      label="创建者"
                    >
                      <span className="font-medium">{task.creator_user.name}</span>
                      <span className="text-muted-foreground text-[12px] ml-1.5">
                        {task.creator_user.email}
                      </span>
                    </InfoRow>
                  )}
                </div>
              </section>

              {/* Progress / Storage */}
              {task.status === "running" && !progress ? (
                <section>
                  <SectionHeader accent="bg-blue-500">下载进度</SectionHeader>
                  <div className="rounded-xl border border-blue-100 dark:border-blue-800/40 bg-blue-50/40 dark:bg-blue-950/20 p-4 flex items-center gap-2 text-muted-foreground text-sm">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>加载进度中...</span>
                  </div>
                </section>
              ) : task.status === "running" && progress ? (
                <section>
                  <SectionHeader accent="bg-blue-500">
                    {statusConfig.storageSectionTitle ?? ""}
                  </SectionHeader>

                  {/* Overall progress */}
                  <div className="rounded-xl border border-blue-100 dark:border-blue-800/40 bg-blue-50/40 dark:bg-blue-950/20 p-4 space-y-3 mb-3">
                    <TaskProgressBar
                      progressPercent={progress.progress_percent}
                      downloadedBytes={progress.downloaded_bytes}
                      totalBytes={progress.total_bytes}
                      speedBytesPerSec={progress.speed_bytes_per_sec}
                      etaSeconds={progress.eta_seconds}
                    />
                  </div>

                  {/* File progress list */}
                  <div className="rounded-xl border border-border/50 overflow-hidden">
                    <div className="bg-muted/40 px-4 py-2.5 border-b border-border/40 flex items-center gap-2">
                      <FileStack className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[13px] font-medium">
                        {statusConfig.fileListTitle}
                      </span>
                      <span className="ml-auto text-[12px] text-muted-foreground tabular-nums">
                        {progress.downloaded_files} / {progress.total_files} 个文件
                      </span>
                    </div>
                    <ScrollArea className="h-60">
                      <div className="px-3 py-1">
                        <FileProgressList
                          taskId={task.id}
                          files={progress.files}
                          isRunning={true}
                          currentFile={progress.current_file}
                        />
                      </div>
                    </ScrollArea>
                  </div>
                </section>
              ) : statusConfig.showStorageStats ? (
                <StorageStatsSection task={task} config={statusConfig} />
              ) : null}

              {/* Error messages */}
              {task.status === "failed" && task.error_message && (
                <Alert
                  variant="destructive"
                  className="border-red-200/60 bg-red-50/60 dark:bg-red-950/20 rounded-xl"
                >
                  <XOctagon className="h-4 w-4" />
                  <AlertDescription className="ml-2 text-[13px]">
                    <span className="font-semibold">任务失败：</span>
                    {task.error_message}
                  </AlertDescription>
                </Alert>
              )}

              {task.status !== "failed" && task.error_message && (
                <Alert className="border-amber-200/60 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800/40 rounded-xl">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <AlertDescription className="ml-2 text-[13px] text-amber-800 dark:text-amber-200">
                    {task.error_message}
                  </AlertDescription>
                </Alert>
              )}

              {/* File tree (non-running states) */}
              {task.repo_items &&
                task.repo_items.length > 0 &&
                task.status !== "running" && (
                  <section>
                    <SectionHeader
                      accent="bg-indigo-500"
                      badge={
                        <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {task.total_file_count} 个文件
                        </span>
                      }
                    >
                      {statusConfig.fileListTitle}
                    </SectionHeader>
                    <div className="rounded-xl border border-border/50 overflow-hidden h-72">
                      <PreviewFileTree
                        items={task.repo_items as PreviewItem[]}
                        repoId={task.repo_id}
                      />
                    </div>
                  </section>
                )}

              {/* Timeline */}
              <section>
                <SectionHeader accent="bg-slate-400">时间记录</SectionHeader>
                <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
                  {buildTimeline(task).map((item, i, arr) => (
                    <TimelineItem
                      key={item.label}
                      label={item.label}
                      value={item.value}
                      isLast={i === arr.length - 1}
                    />
                  ))}
                </div>
              </section>

              {/* Bottom actions */}
              {statusConfig.bottomActionType !== "none" && (
                <div className="pt-1 border-t border-border/40">
                  {statusConfig.bottomActionType === "view-progress" && (
                    <div className="flex gap-2 pt-3">
                      {canCancel && (
                        <Button
                          variant="outline"
                          onClick={handleCancelClick}
                          disabled={cancelTask.isPending}
                          className="h-9 text-[13px] border-red-200 hover:bg-red-50 hover:text-red-600 active:bg-red-100 dark:border-red-800/50 dark:hover:bg-red-950/40 dark:hover:text-red-400 dark:active:bg-red-950/60"
                        >
                          <XCircle className="mr-1.5 h-3.5 w-3.5" />
                          {cancelTask.isPending ? "取消中..." : "取消任务"}
                        </Button>
                      )}
                    </div>
                  )}
                  {statusConfig.bottomActionType === "refresh" && (
                    <div className="flex items-center justify-between bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/40 rounded-xl px-4 py-3 mt-1">
                      <div className="flex items-center gap-2 text-[13px] text-blue-700 dark:text-blue-300 font-medium">
                        <Clock className="h-3.5 w-3.5" />
                        <span>任务排队中，等待执行</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => refetchTask()}
                          className="h-7 text-[12px] border-blue-300 hover:bg-blue-100 active:bg-blue-200 dark:border-blue-700 dark:hover:bg-blue-800/40 dark:active:bg-blue-800/60"
                        >
                          <RefreshCw className="mr-1 h-3 w-3" />
                          刷新
                        </Button>
                        {canCancel && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancelClick}
                            disabled={cancelTask.isPending}
                            className="h-7 text-[12px] border-red-200 hover:bg-red-50 hover:text-red-600 active:bg-red-100 dark:border-red-800/50 dark:hover:bg-red-950/40 dark:active:bg-red-950/60"
                          >
                            <XCircle className="mr-1 h-3 w-3" />
                            {cancelTask.isPending ? "取消中..." : "取消"}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Bottom padding */}
              <div className="h-2" />
            </div>
        ) : null}
      </SheetContent>

      {/* 取消确认对话框 */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认取消任务</AlertDialogTitle>
            <AlertDialogDescription className="pt-2">
              确定要取消任务 <strong className="text-foreground">#{taskId}</strong> 吗？
              {task && (
                <>
                  <p className="mt-2 text-sm">
                    仓库：<span className="font-medium">{task.repo_id}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {task.status === "pending_approval"
                      ? "取消后任务将被标记为已取消，需要重新创建任务。"
                      : "任务正在排队中，取消后需要重新创建任务。"}
                  </p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={cancelTask.isPending}>返回</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelConfirm}
              disabled={cancelTask.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认取消
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

export default TaskDetailDrawer;
