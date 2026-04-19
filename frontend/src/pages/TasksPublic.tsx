import { useState, useMemo, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  Loader2,
  Inbox,
  Plus,
  Activity,
  CheckCircle2,
  Clock,
  AlertCircle,
  Pause,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ActiveTaskList,
  TaskFileProgressPanel,
  TaskHistoryTable,
} from "@/components/tasks";
import { useAuthStore } from "@/stores/auth-store";
import { useActiveTasks, useTaskList } from "@/hooks/useTaskList";
import { queryKeys } from "@/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";

// Skeleton with shimmer animation
function ShimmerSkeleton({ className }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-md ${className}`}>
      <Skeleton className="absolute inset-0" />
      <div className="absolute inset-0 -translate-x-full animate-[shimmer-slide_1.5s_infinite] bg-linear-to-r from-transparent via-white/20 to-transparent motion-reduce:animate-none" />
    </div>
  );
}

// Status summary card component
function StatusCard({
  icon: Icon,
  label,
  value,
  color,
  delay = 0,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-3 rounded-lg bg-muted/40 px-4 py-2.5"
    >
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-md ${color}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
      </div>
    </motion.div>
  );
}

const COUNTDOWN_SECONDS = 5;

export function TasksPublic() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // 用户手动选择的任务 ID（null 表示自动选择模式）
  const [manuallySelectedId, setManuallySelectedId] = useState<number | null>(null);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const countdownRef = useRef(COUNTDOWN_SECONDS);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // 对话框关闭时重置倒计时
  useLayoutEffect(() => {
    if (!showLoginDialog) {
      countdownRef.current = COUNTDOWN_SECONDS;
    }
  }, [showLoginDialog]);

  // 倒计时逻辑
  useLayoutEffect(() => {
    if (!showLoginDialog) return;

    // 重置倒计时状态
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCountdown(COUNTDOWN_SECONDS);

    const timer = setInterval(() => {
      const next = countdownRef.current - 1;
      countdownRef.current = next;
      setCountdown(next);

      if (next <= 0) {
        clearInterval(timer);
        navigate("/login");
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [showLoginDialog, navigate]);

  const handleAddTask = () => {
    if (isAuthenticated) {
      // 已登录，跳转到控制台任务页面
      navigate("/console/tasks");
    } else {
      // 未登录，显示提示对话框
      setShowLoginDialog(true);
    }
  };

  const handleLoginNow = () => {
    navigate("/login");
  };

  const handleCancel = () => {
    setShowLoginDialog(false);
  };

  // 活跃任务：使用专用端点，高频轮询
  const {
    data: activeData,
    isLoading: isActiveLoading,
    error: activeError,
  } = useActiveTasks({ enablePolling: true });

  // 历史任务：使用公共列表端点，不轮询
  const {
    data: historyData,
    isLoading: isHistoryLoading,
    isRefetching: isHistoryRefetching,
    error: historyError,
  } = useTaskList({
    public: true,
    hours: 168,
    limit: 50,
    enablePolling: false,
  });

  // 活跃任务列表（来自专用端点，仅包含 running/pending/pending_approval/canceling）
  const activeTasks = useMemo(() => activeData?.data ?? [], [activeData?.data]);
  const runningTasks = useMemo(
    () => activeTasks.filter((t) => t.status?.toLowerCase() === "running"),
    [activeTasks],
  );

  const pausingTasks = useMemo(
    () => activeTasks.filter((t) => t.status?.toLowerCase() === "pausing"),
    [activeTasks],
  );

  const pausedTasks = useMemo(
    () => activeTasks.filter((t) => t.status?.toLowerCase() === "paused"),
    [activeTasks],
  );

  // 历史任务列表（来自公共列表端点，包含 completed/failed/cancelled 等）
  const completedTasks = useMemo(
    () =>
      (historyData?.data ?? []).sort(
        (a, b) =>
          new Date(b.completed_at || b.updated_at).getTime() -
          new Date(a.completed_at || a.updated_at).getTime(),
      ),
    [historyData?.data],
  );

  // 派生选中的任务 ID：优先使用手动选择，否则自动选择第一个运行中的任务
  const selectedTaskId = useMemo(() => {
    // 用户手动选择了任务
    if (manuallySelectedId !== null) {
      // 检查手动选择的任务是否仍在列表中
      const taskExists = activeTasks.some((t) => t.id === manuallySelectedId);
      if (taskExists) {
        return manuallySelectedId;
      }
      // 手动选择的任务已不在列表中，回退到自动选择
    }

    // 自动选择第一个运行中的任务
    if (runningTasks.length > 0) {
      return runningTasks[0].id;
    }

    // 没有运行中的任务，选择第一个活跃任务
    if (activeTasks.length > 0) {
      return activeTasks[0].id;
    }

    return null;
  }, [manuallySelectedId, activeTasks, runningTasks]);

  // 获取选中的任务详情
  const selectedTask = useMemo(() => {
    if (selectedTaskId === null) return null;
    return activeTasks.find((t) => t.id === selectedTaskId) || null;
  }, [activeTasks, selectedTaskId]);

  // 用户手动选择任务
  const handleSelectTask = (taskId: number | null) => {
    setManuallySelectedId(taskId);
  };

  // 刷新所有任务数据
  const handleRefetch = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
  };

  // 合并加载和错误状态
  const isLoading = isActiveLoading && isHistoryLoading;
  const error = activeError || historyError;

  return (
    <div className="container mx-auto flex flex-1 flex-col px-4 py-6 md:py-8">
      {/* Page Header with Status Summary */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="mb-6 md:mb-8"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              任务列表
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              查看最近的下载任务状态（最近 7 天）
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefetch}
              disabled={isLoading || isHistoryRefetching}
              className="w-24 cursor-pointer transition-all duration-200 hover:bg-primary/5"
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isHistoryRefetching ? "animate-spin" : ""}`}
              />
              刷新
            </Button>
            <Button
              size="sm"
              onClick={handleAddTask}
              className="w-24 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md"
            >
              <Plus className="h-4 w-4" />
              添加任务
            </Button>
          </div>
        </div>

        {/* Status Summary Cards */}
        {!isLoading && !error && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatusCard
              icon={Activity}
              label="运行中"
              value={runningTasks.length}
              color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
              delay={0.05}
            />
            <StatusCard
              icon={Clock}
              label="排队中"
              value={
                activeTasks.filter(
                  (t) =>
                    t.status?.toLowerCase() === "pending" ||
                    t.status?.toLowerCase() === "pending_approval",
                ).length
              }
              color="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
              delay={0.1}
            />
            <StatusCard
              icon={Loader2}
              label="暂停中"
              value={pausingTasks.length}
              color="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
              delay={0.12}
            />
            <StatusCard
              icon={Pause}
              label="已暂停"
              value={pausedTasks.length}
              color="bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400"
              delay={0.14}
            />
            <StatusCard
              icon={CheckCircle2}
              label="已完成"
              value={
                completedTasks.filter(
                  (t) => t.status?.toLowerCase() === "completed",
                ).length
              }
              color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
              delay={0.15}
            />
            <StatusCard
              icon={AlertCircle}
              label="失败"
              value={
                completedTasks.filter(
                  (t) => t.status?.toLowerCase() === "failed",
                ).length
              }
              color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
              delay={0.2}
            />
          </div>
        )}
      </motion.header>

      {/* 主内容区域 */}
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-8"
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <ShimmerSkeleton className="h-6 w-32 mb-4" />
                <ShimmerSkeleton className="h-75" />
              </div>
              <div>
                <ShimmerSkeleton className="h-6 w-32 mb-4" />
                <ShimmerSkeleton className="h-75" />
              </div>
            </div>
            <div>
              <ShimmerSkeleton className="h-6 w-32 mb-4" />
              <ShimmerSkeleton className="h-50" />
            </div>
          </motion.div>
        ) : error ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="text-center py-16"
          >
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
            <p className="text-base font-medium text-foreground">加载失败</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              请检查网络连接后重试
            </p>
            <Button
              variant="outline"
              onClick={handleRefetch}
              className="transition-transform active:scale-95"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              重新加载
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-8"
          >
            {/* Active Tasks Section */}
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                delay: 0.1,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold">进行中的任务</h2>
                <span className="text-sm text-muted-foreground">
                  （共 {activeTasks.length} 个）
                </span>
                {runningTasks.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-sm text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span className="font-medium">
                      {runningTasks.length} 个任务执行中
                    </span>
                  </motion.div>
                )}
              </div>

              <AnimatePresence mode="wait">
                {activeTasks.length === 0 ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.3 }}
                    className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/20"
                  >
                    <div className="text-center px-6">
                      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
                        <Inbox className="h-7 w-7 text-muted-foreground/60" />
                      </div>
                      <p className="text-sm font-medium text-foreground">
                        暂无进行中的任务
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        新任务将自动显示在这里
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="list"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="grid gap-6 lg:grid-cols-[1fr_2fr]"
                  >
                    {/* Task List */}
                    <div className="min-h-128">
                      <h3 className="text-sm font-medium text-muted-foreground mb-3">
                        任务列表
                      </h3>
                      <div className="h-[calc(100%-1.5rem)]">
                        <ActiveTaskList
                          tasks={activeTasks}
                          selectedTaskId={selectedTaskId}
                          onSelectTask={handleSelectTask}
                        />
                      </div>
                    </div>

                    {/* File Progress */}
                    <div className="min-h-128">
                      <h3 className="text-sm font-medium text-muted-foreground mb-3">
                        文件下载进度
                      </h3>
                      <div className="h-[calc(100%-1.5rem)]">
                        <TaskFileProgressPanel task={selectedTask} />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>

            {/* Completed Tasks Section */}
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                delay: 0.2,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <h2 className="text-lg font-semibold mb-4">任务记录</h2>
              <TaskHistoryTable tasks={completedTasks} />
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 登录提示对话框 */}
      <Dialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
        <DialogContent className="sm:max-w-md overflow-hidden">
          {/* 顶部进度条 - 与对话框边框合为一体 */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-muted">
            <div
              className="h-full bg-primary transition-all duration-1000 ease-linear motion-reduce:transition-none"
              style={{ width: `${(countdown / COUNTDOWN_SECONDS) * 100}%` }}
            />
          </div>
          <DialogHeader className="pt-2">
            <DialogTitle>需要登录</DialogTitle>
            <DialogDescription>
              您需要登录后才能提交新任务。{countdown} 秒后将自动跳转到登录页面。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={handleCancel}
              className="transition-transform active:scale-95"
            >
              取消
            </Button>
            <Button
              onClick={handleLoginNow}
              className="transition-transform active:scale-95"
            >
              立即登录
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default TasksPublic;