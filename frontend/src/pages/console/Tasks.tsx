import { useState, useMemo, useCallback } from "react";
import {
  Plus,
  RefreshCw,
  Search,
  AlertCircle,
  ClipboardList,
  Loader2,
  Inbox,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  TaskRow,
  TaskDetailDrawer,
  CreateTaskDialog,
} from "@/components/tasks";
import { useTaskList, usePendingApprovalCount } from "@/hooks/useTaskList";
import { useTaskActions } from "@/hooks/useTaskActions";
import { useAuthStore } from "@/stores/auth-store";
import type { TaskResponse, TaskStatus } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const PAGE_SIZE = 10;

const STATUS_OPTIONS: {
  value: TaskStatus | "all";
  label: string;
  color?: string;
}[] = [
    { value: "all", label: "全部状态" },
    { value: "pending_approval", label: "等待审批", color: "text-amber-500" },
    { value: "pending", label: "排队中", color: "text-slate-500" },
    { value: "running", label: "进行中", color: "text-blue-500" },
    { value: "completed", label: "已完成", color: "text-emerald-500" },
    { value: "failed", label: "失败", color: "text-red-500" },
    { value: "cancelled", label: "已取消", color: "text-gray-500" },
  ];

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1] as const,
    },
  },
};

export function Tasks() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";

  // 筛选状态
  const [status, setStatus] = useState<TaskStatus | "all">("all");
  const [search, setSearch] = useState("");

  // 分页状态
  const [page, setPage] = useState(1);

  // 详情抽屉状态
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 新建任务弹窗状态
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // 任务操作状态
  const [pinningTaskId, setPinningTaskId] = useState<number | null>(null);
  const [unpinningTaskId, setUnpinningTaskId] = useState<number | null>(null);
  const [approvingTaskId, setApprovingTaskId] = useState<number | null>(null);
  const [rejectingTaskId, setRejectingTaskId] = useState<number | null>(null);
  const [cancelingTaskId, setCancelingTaskId] = useState<number | null>(null);
  const [retryingTaskId, setRetryingTaskId] = useState<number | null>(null);

  // 获取任务列表（控制台使用认证API，获取所有任务）
  const { data, isLoading, error, refetch } = useTaskList({
    status: status === "all" ? undefined : status,
    limit: 100,
    public: false,
  });

  // 获取待审批数量（仅管理员）
  const pendingApprovalCount = usePendingApprovalCount();

  // 任务操作 hooks
  const { pinTask, unpinTask, reviewTask, cancelTask, retryTask } = useTaskActions();

  // 筛选和分页计算 - 使用 useMemo 优化
  const { paginatedTasks, total, totalPages } = useMemo(() => {
    const filtered =
      data?.data?.filter((task) => {
        if (!search) return true;
        return task.repo_id.toLowerCase().includes(search.toLowerCase());
      }) || [];

    const totalCount = filtered.length;
    const pages = Math.ceil(totalCount / PAGE_SIZE);
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return {
      paginatedTasks: paginated,
      total: totalCount,
      totalPages: pages,
    };
  }, [data?.data, search, page]);

  const handleViewDetail = useCallback((task: TaskResponse) => {
    setSelectedTaskId(task.id);
    setDrawerOpen(true);
  }, []);

  const handleDrawerOpenChange = useCallback((open: boolean) => {
    setDrawerOpen(open);
    if (!open) {
      setSelectedTaskId(null);
    }
  }, []);

  const handleFilterPendingApproval = useCallback(() => {
    setStatus("pending_approval");
    setPage(1);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleStatusChange = useCallback((value: TaskStatus | "all") => {
    setStatus(value);
    setPage(1);
  }, []);

  const handlePreviousPage = useCallback(() => {
    setPage((p) => Math.max(1, p - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setPage((p) => Math.min(totalPages, p + 1));
  }, [totalPages]);

  const handlePinTask = useCallback(
    async (task: TaskResponse) => {
      setPinningTaskId(task.id);
      try {
        await pinTask.mutateAsync(task.id);
      } finally {
        setPinningTaskId(null);
      }
    },
    [pinTask]
  );

  const handleUnpinTask = useCallback(
    async (task: TaskResponse) => {
      setUnpinningTaskId(task.id);
      try {
        await unpinTask.mutateAsync(task.id);
      } finally {
        setUnpinningTaskId(null);
      }
    },
    [unpinTask]
  );

  const handleApproveTask = useCallback(
    async (task: TaskResponse) => {
      setApprovingTaskId(task.id);
      try {
        await reviewTask.mutateAsync({ taskId: task.id, approved: true });
      } finally {
        setApprovingTaskId(null);
      }
    },
    [reviewTask]
  );

  const handleRejectTask = useCallback(
    async (task: TaskResponse) => {
      setRejectingTaskId(task.id);
      try {
        await reviewTask.mutateAsync({ taskId: task.id, approved: false });
      } finally {
        setRejectingTaskId(null);
      }
    },
    [reviewTask]
  );

  const handleCancelTask = useCallback(
    async (task: TaskResponse) => {
      setCancelingTaskId(task.id);
      try {
        await cancelTask.mutateAsync(task.id);
      } finally {
        setCancelingTaskId(null);
      }
    },
    [cancelTask]
  );

  const handleRetryTask = useCallback(
    async (task: TaskResponse) => {
      setRetryingTaskId(task.id);
      try {
        await retryTask.mutateAsync(task.id);
      } finally {
        setRetryingTaskId(null);
      }
    },
    [retryTask]
  );

  return (
    <motion.div
      className="flex flex-1 flex-col"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {/* 页面标题 */}
      <motion.div className="mb-6 flex items-center justify-between" variants={itemVariants}>
        <div>
          <div className="flex items-center gap-2">
            <motion.div
              initial={{ rotate: -10, scale: 0.9 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <ClipboardList className="size-5 text-primary" />
            </motion.div>
            <h1 className="text-2xl font-semibold tracking-tight">任务列表</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            查看和管理模型/数据集下载任务
          </p>
        </div>
        <div className="flex items-center gap-2">
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 w-24"
              onClick={() => refetch()}
            >
              <RefreshCw className="size-4" />
              刷新
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              size="sm"
              className="gap-2 w-24"
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus className="size-4" />
              新建任务
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* 待审批提示（仅管理员） */}
      <AnimatePresence>
        {isAdmin && pendingApprovalCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -20, height: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mb-6 overflow-hidden"
          >
            <Alert className="border-amber-200/60 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800/40 rounded-xl">
              <AlertCircle className="size-4 text-amber-500 dark:text-amber-400" />
              <AlertTitle className="text-amber-900 dark:text-amber-100 font-semibold text-sm">
                待处理任务
              </AlertTitle>
              <AlertDescription className="flex items-center justify-between text-amber-700 dark:text-amber-300 text-sm mt-1">
                <span>
                  当前有{" "}
                  <motion.strong
                    className="font-semibold"
                    initial={{ scale: 1 }}
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                  >
                    {pendingApprovalCount}
                  </motion.strong>{" "}
                  个任务等待审批
                </span>
                {status !== "pending_approval" && (
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFilterPendingApproval}
                      className="border-amber-300 hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-800/40"
                    >
                      查看待审批
                    </Button>
                  </motion.div>
                )}
              </AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 筛选栏 - 改进样式 */}
      <motion.div
        className="rounded-xl border bg-card p-4 mb-6"
        variants={itemVariants}
        whileHover={{ boxShadow: "0 4px 20px -4px rgba(0, 0, 0, 0.08)" }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex flex-wrap items-center gap-3">
          {/* 状态筛选 */}
          <motion.div whileHover={{ scale: 1.01 }} className="relative">
            <Select
              value={status}
              onValueChange={(v) => handleStatusChange(v as TaskStatus | "all")}
            >
              <SelectTrigger className="w-36 h-9">
                <div className="flex items-center gap-2">
                  <Filter className="size-3.5 text-muted-foreground" />
                  <SelectValue placeholder="状态筛选" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span className="flex items-center gap-2">
                      {option.color && option.value !== "all" && (
                        <span
                          className={cn(
                            "size-2 rounded-full",
                            option.color.replace("text-", "bg-"),
                          )}
                        />
                      )}
                      {option.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </motion.div>

          {/* 搜索框 */}
          <div className="relative flex-1 min-w-50 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="搜索仓库名称..."
              className="pl-9 h-9 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>

          {/* 结果计数 */}
          <AnimatePresence mode="wait">
            {!isLoading && !error && (
              <motion.div
                key="count"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="ml-auto text-sm text-muted-foreground"
              >
                共 <span className="font-medium text-foreground">{total}</span>{" "}
                个任务
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* 任务列表 */}
      <motion.div
        className="rounded-xl border bg-card overflow-hidden"
        variants={itemVariants}
      >
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-64 items-center justify-center"
            >
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                >
                  <Loader2 className="size-8" />
                </motion.div>
                <span className="text-sm">加载中...</span>
              </div>
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-64 items-center justify-center"
            >
              <div className="text-center">
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className="text-destructive mb-3"
                >
                  <AlertCircle className="size-10 mx-auto" />
                </motion.div>
                <p className="text-sm text-muted-foreground">加载失败</p>
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => refetch()}
                  >
                    重试
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          ) : total === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="flex h-64 items-center justify-center"
            >
              <div className="text-center">
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="rounded-2xl bg-muted p-5 mb-4 mx-auto w-fit"
                >
                  <Inbox className="size-8 text-muted-foreground" />
                </motion.div>
                <motion.p
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.15 }}
                  className="text-sm text-muted-foreground"
                >
                  {search ? "未找到匹配的任务" : "暂无任务"}
                </motion.p>
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-4"
                    onClick={() =>
                      search ? handleSearchChange("") : setCreateDialogOpen(true)
                    }
                  >
                    <Plus className="mr-1.5 size-3.5" />
                    {search ? "清除搜索" : "新建任务"}
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="table"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border/50">
                    <TableHead className="w-12 pl-4 text-center font-semibold text-xs">
                      ID
                    </TableHead>
                    <TableHead className="w-80 font-semibold text-xs">
                      仓库
                    </TableHead>
                    <TableHead className="w-24 text-center font-semibold text-xs">
                      版本
                    </TableHead>
                    <TableHead className="w-24 text-center font-semibold text-xs">
                      类型
                    </TableHead>
                    <TableHead className="w-28 text-center font-semibold text-xs">
                      状态
                    </TableHead>
                    <TableHead className="w-40 text-center font-semibold text-xs">
                      需求大小 / 总大小
                    </TableHead>
                    <TableHead className="w-36 text-center font-semibold text-xs">
                      创建时间
                    </TableHead>
                    <TableHead className="w-16 pr-4 text-center font-semibold text-xs">
                      操作
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTasks.map((task, index) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onViewDetail={handleViewDetail}
                      onPin={handlePinTask}
                      onUnpin={handleUnpinTask}
                      onApprove={handleApproveTask}
                      onReject={handleRejectTask}
                      onCancel={handleCancelTask}
                      onRetry={handleRetryTask}
                      isPinning={pinningTaskId === task.id}
                      isUnpinning={unpinningTaskId === task.id}
                      isApproving={approvingTaskId === task.id}
                      isRejecting={rejectingTaskId === task.id}
                      isCanceling={cancelingTaskId === task.id}
                      isRetrying={retryingTaskId === task.id}
                      index={index}
                    />
                  ))}
                </TableBody>
              </Table>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* 分页 */}
      <AnimatePresence>
        {!isLoading && !error && total > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ delay: 0.2 }}
            className="mt-6 flex items-center justify-between"
          >
            <p className="text-sm text-muted-foreground">
              显示{" "}
              <span className="font-medium text-foreground">
                {Math.min((page - 1) * PAGE_SIZE + 1, total)}-
                {Math.min(page * PAGE_SIZE, total)}
              </span>{" "}
              条，共 <span className="font-medium text-foreground">{total}</span>{" "}
              条
            </p>
            {totalPages > 1 && (
              <Pagination className="mx-0 w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <PaginationPrevious
                        onClick={handlePreviousPage}
                        className={
                          page <= 1
                            ? "pointer-events-none opacity-50"
                            : "cursor-pointer"
                        }
                      />
                    </motion.div>
                  </PaginationItem>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (p) => (
                      <PaginationItem key={p}>
                        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                          <PaginationLink
                            onClick={() => setPage(p)}
                            isActive={page === p}
                            className="cursor-pointer"
                          >
                            {p}
                          </PaginationLink>
                        </motion.div>
                      </PaginationItem>
                    ),
                  )}

                  <PaginationItem>
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <PaginationNext
                        onClick={handleNextPage}
                        className={
                          page >= totalPages
                            ? "pointer-events-none opacity-50"
                            : "cursor-pointer"
                        }
                      />
                    </motion.div>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 任务详情抽屉 */}
      <TaskDetailDrawer
        taskId={selectedTaskId}
        open={drawerOpen}
        onOpenChange={handleDrawerOpenChange}
      />

      {/* 新建任务弹窗 */}
      <CreateTaskDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </motion.div>
  );
}

export default Tasks;
