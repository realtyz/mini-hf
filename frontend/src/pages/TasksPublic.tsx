import { useState, useMemo, useLayoutEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
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
import api from "@/lib/api";
import type { TaskListResponse } from "@/lib/api-types";

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

async function fetchPublicTasks(): Promise<TaskListResponse> {
  return api.get<TaskListResponse>("/task/list_public", {
    params: {
      hours: 168,
      limit: 100,
    },
  });
}

const COUNTDOWN_SECONDS = 5;

export function TasksPublic() {
  const navigate = useNavigate();
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

  const { data, isLoading, isRefetching, error, refetch } = useQuery({
    queryKey: ["public-tasks"],
    queryFn: fetchPublicTasks,
    refetchInterval: (query) => {
      // 如果有运行中的任务，每 3 秒刷新一次
      const tasks = query.state.data?.data;
      if (tasks?.some((t) => t.status?.toLowerCase() === "running")) {
        return 3000;
      }
      // 否则每 30 秒刷新一次
      return 30000;
    },
  });

  // 按状态分组任务
  const { activeTasks, runningTasks, completedTasks } = useMemo(() => {
    const taskList = data?.data || [];

    // 进行中和排队中的任务（左侧列表显示）
    const active = taskList.filter(
      (t) =>
        t.status?.toLowerCase() === "running" ||
        t.status?.toLowerCase() === "pending",
    );

    // 运行中的任务（用于自动选择）
    const running = taskList.filter(
      (t) => t.status?.toLowerCase() === "running",
    );

    // 已完成和失败的任务（底部表格显示）
    const completed = taskList
      .filter(
        (t) =>
          t.status?.toLowerCase() === "completed" ||
          t.status?.toLowerCase() === "failed" ||
          t.status?.toLowerCase() === "cancelled" ||
          t.status?.toLowerCase() === "canceling" ||
          t.status?.toLowerCase() === "pending_approval",
      )
      .sort(
        (a, b) =>
          new Date(b.completed_at || b.updated_at).getTime() -
          new Date(a.completed_at || a.updated_at).getTime(),
      );

    return {
      activeTasks: active,
      runningTasks: running,
      completedTasks: completed,
    };
  }, [data?.data]);

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
    const taskList = data?.data || [];
    return taskList.find((t) => t.id === selectedTaskId) || null;
  }, [data?.data, selectedTaskId]);

  // 用户手动选择任务
  const handleSelectTask = (taskId: number | null) => {
    setManuallySelectedId(taskId);
  };

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
              onClick={() => refetch()}
              disabled={isLoading || isRefetching}
              className="w-24 cursor-pointer transition-all duration-200 hover:bg-primary/5"
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isLoading || isRefetching ? "animate-spin" : ""}`}
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
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatusCard
              icon={Activity}
              label="运行中"
              value={
                activeTasks.filter((t) => t.status?.toLowerCase() === "running")
                  .length
              }
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
              onClick={() => refetch()}
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
                {activeTasks.filter(
                  (t) => t.status?.toLowerCase() === "running",
                ).length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-sm text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span className="font-medium">
                      {
                        activeTasks.filter(
                          (t) => t.status?.toLowerCase() === "running",
                        ).length
                      }{" "}
                      个任务执行中
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
                    className="rounded-xl border-2 border-dashed bg-muted/20 py-16"
                  >
                    <div className="text-center">
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
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-3">
                        任务列表
                      </h3>
                      <ActiveTaskList
                        tasks={activeTasks}
                        selectedTaskId={selectedTaskId}
                        onSelectTask={handleSelectTask}
                      />
                    </div>

                    {/* File Progress */}
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground mb-3">
                        文件下载进度
                      </h3>
                      <TaskFileProgressPanel task={selectedTask} />
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
