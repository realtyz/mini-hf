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
import { formatBytes } from "@/lib/utils";
import type { TaskResponse } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useAuthStore } from "@/stores/auth-store";
import { useState } from "react";

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

// 检查任务是否在7天内完成
function isWithin7Days(completedAt: string | null): boolean {
  if (!completedAt) return false;
  const completedDate = new Date(completedAt);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return completedDate >= sevenDaysAgo;
}

export function TaskRow({
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

  // 取消确认对话框状态
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  // 重试确认对话框状态
  const [retryDialogOpen, setRetryDialogOpen] = useState(false);

  // 是否可以取消（待审批或排队中的任务）
  const canCancel =
    (task.status === "pending_approval" || task.status === "pending") &&
    (isAdmin || task.creator_user_id === user?.id);

  // 是否可以重试（失败状态且7天内完成）
  const canRetry =
    task.status === "failed" &&
    isWithin7Days(task.completed_at) &&
    (isAdmin || task.creator_user_id === user?.id);

  // 管理员操作权限
  const canApproveOrReject = isAdmin && task.status === "pending_approval";
  const canPin = isAdmin && task.status === "pending" && !isPinned;
  const canUnpin = isAdmin && task.status === "pending" && isPinned;

  const handleActionClick = (
    e: React.MouseEvent,
    action: () => void
  ) => {
    e.stopPropagation();
    action();
  };

  const handleCancelConfirm = () => {
    setCancelDialogOpen(false);
    onCancel?.(task);
  };

  const handleRetryConfirm = () => {
    setRetryDialogOpen(false);
    onRetry?.(task);
  };

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
        "h-14 transition-all duration-200",
        "hover:bg-muted/70",
        "group border-b border-border/50 last:border-b-0",
        isPinned && "bg-amber-50/50 dark:bg-amber-950/10"
      )}
    >
      <TableCell className="pl-4 text-center">
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
          <motion.span
            className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
            whileHover={{ scale: 1.05 }}
            transition={{ duration: 0.15 }}
          >
            #{task.id}
          </motion.span>
        </div>
      </TableCell>
      <TableCell className="font-medium max-w-0" title={task.repo_id}>
        <span className="block truncate text-sm">
          {task.repo_id}
        </span>
      </TableCell>
      <TableCell className="text-center">
        <code className="text-xs bg-muted/80 px-1.5 py-0.5 rounded font-mono text-muted-foreground transition-colors duration-200 group-hover:bg-muted group-hover:text-foreground">
          {task.revision}
        </code>
      </TableCell>
      <TableCell className="text-center">
        <Badge
          variant={task.repo_type === "model" ? "default" : "secondary"}
          className={cn(
            "w-20 text-xs justify-center gap-1.5 transition-all duration-200",
            "group-hover:shadow-sm"
          )}
        >
          <motion.span
            initial={{ scale: 1 }}
            whileHover={{ scale: 1.15, rotate: task.repo_type === "model" ? 12 : 0 }}
            transition={{ duration: 0.2 }}
          >
            {task.repo_type === "model" ? (
              <Box className="size-3" />
            ) : (
              <Database className="size-3" />
            )}
          </motion.span>
          {task.repo_type === "model" ? "模型" : "数据集"}
        </Badge>
      </TableCell>
      <TableCell className="text-center">
        <TaskStatusBadge status={task.status} />
      </TableCell>
      <TableCell className="text-center">
        <div className="flex flex-col items-center gap-0.5">
          <motion.span
            className="text-xs font-medium tabular-nums"
            initial={{ opacity: 0.8 }}
            whileHover={{ opacity: 1, scale: 1.02 }}
            transition={{ duration: 0.15 }}
          >
            {formatBytes(task.required_storage)}
          </motion.span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            / {formatBytes(task.total_storage)}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-center">
        <span className="text-xs text-muted-foreground transition-colors duration-200 group-hover:text-foreground/70">
          {new Date(task.created_at).toLocaleDateString("zh-CN", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </TableCell>
      <TableCell className="pr-4 text-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {/* 查看详情 - 所有用户、所有状态都可用 */}
            <DropdownMenuItem
              onClick={(e) => handleActionClick(e, () => onViewDetail(task))}
            >
              <Eye className="mr-2 h-4 w-4 text-muted-foreground" />
              查看详情
            </DropdownMenuItem>

            {/* 待审批状态的操作 */}
            {canApproveOrReject && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) =>
                    handleActionClick(e, () => onApprove?.(task))
                  }
                  disabled={isApproving}
                >
                  <Check className="mr-2 h-4 w-4 text-muted-foreground" />
                  批准
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) =>
                    handleActionClick(e, () => onReject?.(task))
                  }
                  disabled={isRejecting}
                  className="text-destructive focus:text-destructive"
                >
                  <X className="mr-2 h-4 w-4" />
                  拒绝
                </DropdownMenuItem>
              </>
            )}

            {/* 排队中状态的管理员操作 */}
            {(canPin || canUnpin) && (
              <>
                <DropdownMenuSeparator />
                {canPin && (
                  <DropdownMenuItem
                    onClick={(e) => handleActionClick(e, () => onPin?.(task))}
                    disabled={isPinning}
                  >
                    <Pin className="mr-2 h-4 w-4 text-muted-foreground" />
                    置顶
                  </DropdownMenuItem>
                )}
                {canUnpin && (
                  <DropdownMenuItem
                    onClick={(e) => handleActionClick(e, () => onUnpin?.(task))}
                    disabled={isUnpinning}
                  >
                    <PinOff className="mr-2 h-4 w-4 text-muted-foreground" />
                    取消置顶
                  </DropdownMenuItem>
                )}
              </>
            )}

            {/* 取消操作 */}
            {canCancel && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setCancelDialogOpen(true);
                  }}
                  disabled={isCanceling}
                  className="text-destructive focus:text-destructive"
                >
                  <Ban className="mr-2 h-4 w-4" />
                  取消
                </DropdownMenuItem>
              </>
            )}

            {/* 重试操作 */}
            {canRetry && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setRetryDialogOpen(true);
                  }}
                  disabled={isRetrying}
                >
                  <RotateCcw className="mr-2 h-4 w-4 text-muted-foreground" />
                  重试
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 取消确认对话框 */}
        <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认取消任务</AlertDialogTitle>
              <AlertDialogDescription className="pt-2">
                确定要取消任务 <strong className="text-foreground">#{task.id}</strong> 吗？
                <p className="mt-2 text-sm">
                  仓库：<span className="font-medium">{task.repo_id}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {task.status === "pending_approval"
                    ? "取消后任务将被标记为已取消，需要重新创建任务。"
                    : "任务正在排队中，取消后需要重新创建任务。"}
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel disabled={isCanceling}>返回</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCancelConfirm}
                disabled={isCanceling}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                确认取消
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* 重试确认对话框 */}
        <AlertDialog open={retryDialogOpen} onOpenChange={setRetryDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认重试任务</AlertDialogTitle>
              <AlertDialogDescription className="pt-2">
                确定要重试任务 <strong className="text-foreground">#{task.id}</strong> 吗？
                <p className="mt-2 text-sm">
                  仓库：<span className="font-medium">{task.repo_id}</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  新任务将自动审批通过，无需管理员审核。
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel disabled={isRetrying}>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRetryConfirm}
                disabled={isRetrying}
              >
                确认重试
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </motion.tr>
  );
}
