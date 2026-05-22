import { useState, useMemo, useCallback } from "react";
import { Plus, RefreshCw, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaginatedNavigation } from "@/components/shared/PaginatedNavigation";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TaskRow,
  TaskDetailDrawer,
  CreateTaskDialog,
} from "@/components/tasks";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { useTaskList, usePendingApprovalCount } from "@/hooks/use-task-list";
import { useTaskActions } from "@/hooks/use-task-actions";
import { useAuthStore } from "@/stores/auth-store";
import type { TaskResponse, TaskStatus } from "@/lib/api/types";
import { motion, AnimatePresence } from "framer-motion";
import { containerVariants, itemVariants } from "@/lib/animations/motion-config";
import { TaskFilterBar } from "./TaskFilterBar";
import { TaskAlertBanner } from "./TaskAlertBanner";

const PAGE_SIZE = 10;

export function Tasks() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";

  const [status, setStatus] = useState<TaskStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data, isLoading, error, refetch } = useTaskList({
    status: status === "all" ? undefined : status,
    limit: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
    search: search,
    public: false,
  });

  const pendingApprovalCount = usePendingApprovalCount();
  const { pinTask, unpinTask, reviewTask, cancelTask, retryTask } = useTaskActions();

  const { paginatedTasks, total, totalPages } = useMemo(() => {
    return {
      paginatedTasks: data?.data || [],
      total: data?.total || 0,
      totalPages: Math.ceil((data?.total || 0) / PAGE_SIZE),
    };
  }, [data?.data, data?.total]);

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

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusChange = (value: TaskStatus | "all") => {
    setStatus(value);
    setPage(1);
  };

  const handlePinTask = useCallback(
    (task: TaskResponse) => { pinTask.mutate(task.id); },
    [pinTask]
  );

  const handleUnpinTask = useCallback(
    (task: TaskResponse) => { unpinTask.mutate(task.id); },
    [unpinTask]
  );

  const handleApproveTask = useCallback(
    (task: TaskResponse) => { reviewTask.mutate({ taskId: task.id, approved: true }); },
    [reviewTask]
  );

  const handleRejectTask = useCallback(
    (task: TaskResponse) => { reviewTask.mutate({ taskId: task.id, approved: false }); },
    [reviewTask]
  );

  const handleCancelTask = useCallback(
    (task: TaskResponse) => { cancelTask.mutate(task.id); },
    [cancelTask]
  );

  const handleRetryTask = useCallback(
    (task: TaskResponse) => { retryTask.mutate(task.id); },
    [retryTask]
  );

  return (
    <motion.div
      className="flex flex-1 flex-col"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <motion.div variants={itemVariants}>
        <PageHeader
          icon={ClipboardList}
          title="任务列表"
          subtitle="查看和管理模型/数据集下载任务"
          actions={
            <>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 w-24 cursor-pointer"
                  onClick={() => refetch()}
                >
                  <RefreshCw className="size-4" />
                  刷新
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  size="sm"
                  className="gap-2 w-24 cursor-pointer"
                  onClick={() => setCreateDialogOpen(true)}
                >
                  <Plus className="size-4" />
                  新建任务
                </Button>
              </motion.div>
            </>
          }
        />
      </motion.div>

      <TaskAlertBanner
        visible={isAdmin && pendingApprovalCount > 0}
        pendingCount={pendingApprovalCount}
        isFilteringPending={status === "pending_approval"}
        onFilterPending={() => { setStatus("pending_approval"); setPage(1); }}
      />

      <TaskFilterBar
        status={status}
        onStatusChange={handleStatusChange}
        search={search}
        onSearchChange={handleSearchChange}
        total={total}
        isLoading={isLoading}
        error={error}
      />

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
            >
              <LoadingSkeleton message="加载中..." />
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <ErrorState message="加载失败" onRetry={() => refetch()} />
            </motion.div>
          ) : total === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <EmptyState
                message={search ? "未找到匹配的任务" : "暂无任务"}
                actionLabel={search ? "清除搜索" : "新建任务"}
                onAction={() =>
                  search ? handleSearchChange("") : setCreateDialogOpen(true)
                }
              />
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
                      isPinning={pinTask.isPending && pinTask.variables === task.id}
                      isUnpinning={unpinTask.isPending && unpinTask.variables === task.id}
                      isApproving={reviewTask.isPending && reviewTask.variables?.taskId === task.id && reviewTask.variables?.approved === true}
                      isRejecting={reviewTask.isPending && reviewTask.variables?.taskId === task.id && reviewTask.variables?.approved === false}
                      isCanceling={cancelTask.isPending && cancelTask.variables === task.id}
                      isRetrying={retryTask.isPending && retryTask.variables === task.id}
                      index={index}
                    />
                  ))}
                </TableBody>
              </Table>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

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
              <PaginatedNavigation
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                className="mx-0 w-auto"
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <TaskDetailDrawer
        taskId={selectedTaskId}
        open={drawerOpen}
        onOpenChange={handleDrawerOpenChange}
      />

      <CreateTaskDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </motion.div>
  );
}

export default Tasks;
