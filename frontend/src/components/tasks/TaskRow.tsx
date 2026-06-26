import { memo, useState, useCallback } from "react";
import {
  Box,
  Database,
  Pin,
  PinOff,
  MoreHorizontal,
  Eye,
  Check,
  X,
  Ban,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TaskStatusBadge } from "@/components/tasks/TaskStatusBadge";
import { TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { RetryTaskDialog } from "@/components/tasks/RetryTaskDialog";
import { formatBytes } from "@/lib/utils";
import type { TaskResponse } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useAuthStore } from "@/stores/auth-store";
import type { ReactNode } from "react";

export interface TaskRowProps {
  task: TaskResponse;
  onViewDetail: (task: TaskResponse) => void;
  onPin?: (task: TaskResponse) => void;
  onUnpin?: (task: TaskResponse) => void;
  onApprove?: (task: TaskResponse) => void;
  onReject?: (task: TaskResponse) => void;
  onCancel?: (task: TaskResponse) => void;
  onRetry?: (task: TaskResponse) => void;
  isPinning?: boolean;
  isUnpinning?: boolean;
  isApproving?: boolean;
  isRejecting?: boolean;
  isCanceling?: boolean;
  isRetrying?: boolean;
  index?: number;
}

const FINAL_STATUSES = ["completed", "failed", "cancelled"];

function isWithin7Days(completedAt: string | null): boolean {
  if (!completedAt) return false;
  const completedDate = new Date(completedAt);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return completedDate >= sevenDaysAgo;
}

type DialogType = "cancel" | "retry" | "approve" | "reject";

interface DialogConfig {
  title: string;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive";
  getDescription: (task: TaskResponse) => ReactNode;
}

const DIALOG_CONFIGS: Record<DialogType, DialogConfig> = {
  cancel: {
    title: "确认取消任务",
    confirmLabel: "确认取消",
    confirmVariant: "destructive",
    getDescription: (task) => (
      <>
        确定要取消任务 <strong className="text-foreground">#{task.id}</strong>{" "}
        吗？
        <p className="mt-2 text-sm">
          仓库：<span className="font-medium">{task.repo_id}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {task.status === "pending_approval"
            ? "取消后任务将被标记为已取消，需要重新创建任务。"
            : "任务正在排队中，取消后需要重新创建任务。"}
        </p>
      </>
    ),
  },
  retry: {
    title: "确认重试任务",
    confirmLabel: "确认重试",
    getDescription: (task) => (
      <>
        确定要重试任务 <strong className="text-foreground">#{task.id}</strong>{" "}
        吗？
        <p className="mt-2 text-sm">
          仓库：<span className="font-medium">{task.repo_id}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {task.status === "failed"
            ? "原任务执行失败，新任务将自动审批通过，无需管理员审核。"
            : "原任务已被取消，新任务将自动审批通过，无需管理员审核。"}
        </p>
      </>
    ),
  },
  approve: {
    title: "确认批准任务",
    confirmLabel: "确认批准",
    getDescription: (task) => (
      <>
        确认要批准任务 <strong className="text-foreground">#{task.id}</strong>{" "}
        吗？
        <p className="mt-2 text-sm">
          仓库：<span className="font-medium">{task.repo_id}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          批准后任务将进入下载队列开始执行。
        </p>
      </>
    ),
  },
  reject: {
    title: "确认拒绝任务",
    confirmLabel: "确认拒绝",
    confirmVariant: "destructive",
    getDescription: (task) => (
      <>
        确认要拒绝任务 <strong className="text-foreground">#{task.id}</strong>{" "}
        吗？
        <p className="mt-2 text-sm">
          仓库：<span className="font-medium">{task.repo_id}</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          拒绝后任务将被标记为失败，需要重新创建任务。
        </p>
      </>
    ),
  },
};

const DIALOG_DISABLED: Record<
  DialogType,
  keyof Pick<
    TaskRowProps,
    "isCanceling" | "isRetrying" | "isApproving" | "isRejecting"
  >
> = {
  cancel: "isCanceling",
  retry: "isRetrying",
  approve: "isApproving",
  reject: "isRejecting",
};

const DIALOG_HANDLER: Record<
  DialogType,
  keyof Pick<TaskRowProps, "onCancel" | "onRetry" | "onApprove" | "onReject">
> = {
  cancel: "onCancel",
  retry: "onRetry",
  approve: "onApprove",
  reject: "onReject",
};

export const TaskRow = memo(function TaskRow({
  task,
  onViewDetail,
  onPin,
  onUnpin,
  onApprove,
  onReject,
  onCancel,
  onRetry,
  isPinning,
  isUnpinning,
  isApproving,
  isRejecting,
  isCanceling,
  isRetrying,
  index = 0,
}: TaskRowProps) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const isFinalStatus = FINAL_STATUSES.includes(task.status);
  const isPinned = !!task.pinned_at && !isFinalStatus;
  const isRunning = task.status === "running";

  const [dialogType, setDialogType] = useState<DialogType | null>(null);

  const canCancel =
    (task.status === "pending_approval" || task.status === "pending") &&
    (isAdmin || task.creator_user_id === user?.id);

  const canRetry =
    (task.status === "failed" || task.status === "cancelled") &&
    isWithin7Days(task.completed_at) &&
    (isAdmin || task.creator_user_id === user?.id);

  const canApproveOrReject = isAdmin && task.status === "pending_approval";
  const canPin = isAdmin && task.status === "pending" && !isPinned;
  const canUnpin = isAdmin && task.status === "pending" && isPinned;

  const handleDialogConfirm = useCallback(() => {
    if (!dialogType) return;
    const handlerKey = DIALOG_HANDLER[dialogType];
    const handlers = { onCancel, onRetry, onApprove, onReject };
    const handler = handlers[handlerKey];
    setDialogType(null);
    handler?.(task);
  }, [dialogType, task, onCancel, onRetry, onApprove, onReject]);

  const dialogConfig = dialogType ? DIALOG_CONFIGS[dialogType] : null;
  const disabledKey = dialogType ? DIALOG_DISABLED[dialogType] : null;
  const isDialogDisabled = disabledKey
    ? (() => {
        const props = { isCanceling, isRetrying, isApproving, isRejecting };
        return !!props[disabledKey];
      })()
    : false;

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: 0.35,
        delay: index * 0.04,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={cn(
        "group border-b border-border/30 last:border-0 transition-all duration-150",
        "hover:bg-muted/20",
        isRunning && "animate-pulse-bg",
      )}
    >
      <TableCell className="py-3 pl-5 text-center">
        <div className="flex items-center justify-center gap-1.5">
          {isPinned && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
            >
              <Pin className="size-3.5 text-amber-500 fill-amber-500" />
            </motion.div>
          )}
          <span className="font-mono text-[12.5px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-md">
            #{task.id}
          </span>
        </div>
      </TableCell>
      <TableCell className="py-3 pl-4" title={task.repo_id}>
        <span className="block truncate max-w-70 text-[13px] font-medium text-foreground/80 group-hover:text-primary transition-colors">
          {task.repo_id}
        </span>
      </TableCell>
      <TableCell className="py-3 text-center">
        <code className="text-[12.5px] bg-muted/50 px-1.5 py-0.5 rounded-md font-mono text-muted-foreground">
          {task.revision}
        </code>
      </TableCell>
      <TableCell className="py-3 text-center">
        <Badge
          variant={task.repo_type === "model" ? "default" : "secondary"}
          className={cn(
            "text-[11px] font-medium rounded-lg px-2.5 py-0.5",
            task.repo_type === "model"
              ? "bg-slate-100 text-slate-600 border-slate-200/50 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700/50"
              : "bg-amber-50 text-amber-700 border-amber-200/50 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/40",
          )}
        >
          {task.repo_type === "model" ? (
            <Box className="size-3 mr-1" />
          ) : (
            <Database className="size-3 mr-1" />
          )}
          {task.repo_type === "model" ? "模型" : "数据集"}
        </Badge>
      </TableCell>
      <TableCell className="py-3 text-center">
        <TaskStatusBadge status={task.status} />
      </TableCell>
      <TableCell className="py-3 text-center">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[13px] font-medium tabular-nums text-foreground/80">
            {formatBytes(task.required_storage)}
          </span>
          <span className="text-[11px] text-muted-foreground/60 tabular-nums">
            / {formatBytes(task.total_storage)}
          </span>
        </div>
      </TableCell>
      <TableCell className="py-3 text-center">
        <span className="text-[13px] text-muted-foreground/60 tabular-nums">
          {new Date(task.created_at).toLocaleDateString("zh-CN", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </TableCell>
      <TableCell className="py-3 pr-5 text-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 opacity-0 group-hover:opacity-100 transition-all duration-150 rounded-lg data-[state=open]:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-3.5 text-muted-foreground/60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-40 rounded-xl"
            sideOffset={4}
          >
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onViewDetail(task);
              }}
              className="text-[13px] cursor-pointer rounded-lg"
            >
              <Eye className="mr-2.5 h-3.5 w-3.5 text-muted-foreground" />
              查看详情
            </DropdownMenuItem>

            {canApproveOrReject && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setDialogType("approve");
                  }}
                  disabled={isApproving}
                  className="text-[13px] cursor-pointer rounded-lg"
                >
                  <Check className="mr-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  批准
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setDialogType("reject");
                  }}
                  disabled={isRejecting}
                  className="text-[13px] cursor-pointer text-destructive focus:text-destructive rounded-lg"
                >
                  <X className="mr-2.5 h-3.5 w-3.5" />
                  拒绝
                </DropdownMenuItem>
              </>
            )}

            {(canPin || canUnpin) && (
              <>
                <DropdownMenuSeparator />
                {canPin && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onPin?.(task);
                    }}
                    disabled={isPinning}
                    className="text-[13px] cursor-pointer rounded-lg"
                  >
                    <Pin className="mr-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    置顶
                  </DropdownMenuItem>
                )}
                {canUnpin && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnpin?.(task);
                    }}
                    disabled={isUnpinning}
                    className="text-[13px] cursor-pointer rounded-lg"
                  >
                    <PinOff className="mr-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    取消置顶
                  </DropdownMenuItem>
                )}
              </>
            )}

            {canCancel && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setDialogType("cancel");
                  }}
                  disabled={isCanceling}
                  className="text-[13px] cursor-pointer text-destructive focus:text-destructive rounded-lg"
                >
                  <Ban className="mr-2.5 h-3.5 w-3.5" />
                  取消
                </DropdownMenuItem>
              </>
            )}

            {canRetry && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setDialogType("retry");
                  }}
                  disabled={isRetrying}
                  className="text-[13px] cursor-pointer rounded-lg"
                >
                  <RotateCcw className="mr-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  重试
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {dialogType === "retry" ? (
          <RetryTaskDialog
            open={true}
            onOpenChange={(open) => {
              if (!open) setDialogType(null);
            }}
            taskId={task.id}
            repoId={task.repo_id}
            revision={task.revision}
            onRetrySuccess={() => {
              setDialogType(null);
              onRetry?.(task);
            }}
          />
        ) : (
          <ConfirmDialog
            open={dialogType !== null}
            onOpenChange={(open) => {
              if (!open) setDialogType(null);
            }}
            title={dialogConfig?.title ?? ""}
            description={
              dialogConfig ? dialogConfig.getDescription(task) : null
            }
            confirmLabel={dialogConfig?.confirmLabel ?? ""}
            confirmVariant={dialogConfig?.confirmVariant}
            onConfirm={handleDialogConfirm}
            disabled={isDialogDisabled}
          />
        )}
      </TableCell>
    </motion.tr>
  );
});
