import { motion, AnimatePresence } from "framer-motion";
import {
  containerVariants,
  itemVariants,
} from "@/lib/animations/motion-config";
import { useState, useMemo, useEffect } from "react";
import { debounce } from "lodash-es";
import { RefreshCw, Plus, Search, X, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListFooter } from "@/components/shared/ListFooter";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { useUsers } from "@/hooks/api/use-user-queries";
import type { UserResponse } from "@/lib/api/types";
import { UsersTableSkeleton } from "./UsersTableSkeleton";
import { UsersEmptyState } from "./UsersEmptyState";
import { UsersTable } from "./UsersTable";
import { DeleteUserAlertDialog } from "./DeleteUserAlertDialog";
import { ResetPasswordDialog } from "./ResetPasswordDialog";
import { EditUserDialog } from "./EditUserDialog";
import { CreateUserDialog } from "./CreateUserDialog";

const PAGE_SIZE = 10;

export function Users() {
  const [search, setSearch] = useState("");
  const [emailSearch, setEmailSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [resetPwdOpen, setResetPwdOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserResponse | null>(null);

  // 防抖搜索，延迟500ms发送请求
  const debouncedSearch = useMemo(
    () =>
      debounce((value: string) => {
        setEmailSearch(value);
        setPage(1); // 搜索时重置到第一页
      }, 500),
    [],
  );

  const { data, isLoading, error, refetch } = useUsers({
    skip: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
    email_search: emailSearch,
  });

  const users = useMemo(() => data?.data ?? [], [data]);
  const totalItems = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  const handleSearch = (value: string) => {
    setSearch(value);
    debouncedSearch(value.trim());
  };

  // 组件卸载时取消防抖
  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  const handleEdit = (user: UserResponse) => {
    setSelectedUser(user);
    setEditOpen(true);
  };

  const handleResetPassword = (user: UserResponse) => {
    setSelectedUser(user);
    setResetPwdOpen(true);
  };

  const handleDelete = (user: UserResponse) => {
    setSelectedUser(user);
    setDeleteOpen(true);
  };

  return (
    <motion.div
      className="flex flex-1 flex-col gap-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <PageHeader
          icon={UsersIcon}
          title="用户管理"
          subtitle="管理系统用户账号和权限"
          actions={
            <>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 w-24 cursor-pointer"
                  onClick={() => refetch()}
                  disabled={isLoading}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                  />
                  刷新
                </Button>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  size="sm"
                  className="gap-2 w-24 cursor-pointer"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  新建用户
                </Button>
              </motion.div>
            </>
          }
        />
      </motion.div>

      {/* Search Bar */}
      <motion.div
        className="relative rounded-2xl border border-border/60 bg-card overflow-hidden"
        variants={itemVariants}
      >
        {/* Top accent line */}
        <div className="absolute top-0 left-4 right-4 h-px bg-linear-to-r from-transparent via-border/40 to-transparent" />
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="relative flex-1 min-w-50 max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/50 pointer-events-none" />
            <Input
              type="search"
              placeholder="搜索姓名或邮箱..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9.5 h-9 rounded-xl border-border/60 text-[13px] transition-all duration-200 focus:ring-2 focus:ring-primary/15"
            />
            {search && (
              <button
                type="button"
                onClick={() => handleSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40 hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={`${totalItems}-${emailSearch}`}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="ml-auto flex items-center gap-1.5 text-[13px] text-muted-foreground/60"
            >
              <span className="font-mono font-medium tabular-nums text-foreground/80">
                {totalItems.toLocaleString()}
              </span>
              个用户
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      {/* User List */}
      <AnimatePresence mode="wait">
        {isLoading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <UsersTableSkeleton />
          </motion.div>
        )}

        {error && !isLoading && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <ErrorState
              message="加载失败"
              description="无法获取用户列表，请稍后重试"
              onRetry={() => refetch()}
            />
          </motion.div>
        )}

        {!isLoading && !error && users.length === 0 && (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
          >
            <UsersEmptyState
              search={search}
              onCreate={() => setCreateOpen(true)}
            />
          </motion.div>
        )}

        {!isLoading && !error && users.length > 0 && (
          <motion.div
            key="table"
            className="relative rounded-2xl border border-border/60 bg-card overflow-hidden"
            variants={itemVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Subtle top accent line */}
            <div className="absolute top-0 left-4 right-4 h-px bg-linear-to-r from-transparent via-border/40 to-transparent" />

            <div className="overflow-x-auto">
              <UsersTable
                users={users}
                onEdit={handleEdit}
                onResetPassword={handleResetPassword}
                onDelete={handleDelete}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer: Stats + Pagination */}
      {!isLoading && !error && users.length > 0 && (
        <motion.div variants={itemVariants}>
          <ListFooter
            currentPage={page}
            totalPages={totalPages}
            total={totalItems}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            itemLabel="个用户"
            note={
              search ? (
                <span className="text-muted-foreground/40">（筛选中）</span>
              ) : undefined
            }
          />
        </motion.div>
      )}

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditUserDialog
        key={selectedUser?.id}
        user={selectedUser}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <ResetPasswordDialog
        user={selectedUser}
        open={resetPwdOpen}
        onOpenChange={setResetPwdOpen}
      />
      <DeleteUserAlertDialog
        user={selectedUser}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </motion.div>
  );
}

export default Users;
