import { motion, AnimatePresence } from "framer-motion";
import { containerVariants, itemVariants } from "@/lib/animations/motion-config";
import { useState, useMemo, useEffect } from "react";
import { debounce } from "lodash-es";
import {
  RefreshCw,
  Plus,
  GripHorizontal,
  Pencil,
  KeyRound,
  Trash2,
  Search,
  X,
  Shield,
  User,
  Mail,
  Calendar,
  AlertCircle,
  CheckCircle2,
  UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PaginationFooter } from "@/components/shared/PaginationFooter";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState } from "@/components/shared/ErrorState";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useResetUserPassword,
} from "@/hooks/api/use-user-queries";
import type { UserResponse, UserRole } from "@/lib/api/types";
import { avatarColor, getInitials } from "./user-avatar";
import { UsersTableSkeleton } from "./UsersTableSkeleton";
import { UsersEmptyState } from "./UsersEmptyState";

const PAGE_SIZE = 10;

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Loading Skeleton Component
// (extracted to ./UsersTableSkeleton.tsx)
// ═══════════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════════
// Create User Dialog
// ═══════════════════════════════════════════════════════════════════════════════

function CreateUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const { mutate: createUser, isPending } = useCreateUser();

  const reset = () => {
    setName("");
    setEmail("");
    setPassword("");
    setRole("user");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createUser(
      { name, email, password, role },
      {
        onSuccess: () => {
          toast.success("用户创建成功", {
            description: `${name} 已添加到系统中`,
            icon: <CheckCircle2 className="h-4 w-4" />,
          });
          onOpenChange(false);
          reset();
        },
        onError: (error: Error) => {
          toast.error("创建失败", {
            description: error.message || "请稍后重试",
            icon: <AlertCircle className="h-4 w-4" />,
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight">
            新建用户
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          <div className="space-y-2.5">
            <Label htmlFor="create-name" className="text-sm font-medium">
              姓名
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="create-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="输入用户姓名"
                className="pl-10"
              />
            </div>
          </div>
          <div className="space-y-2.5">
            <Label htmlFor="create-email" className="text-sm font-medium">
              邮箱
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="create-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="user@example.com"
                className="pl-10"
              />
            </div>
          </div>
          <div className="space-y-2.5">
            <Label htmlFor="create-password" className="text-sm font-medium">
              密码
            </Label>
            <Input
              id="create-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="至少 6 位字符"
            />
          </div>
          <div className="space-y-2.5">
            <Label className="text-sm font-medium">角色</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5" />
                    普通用户
                  </div>
                </SelectItem>
                <SelectItem value="admin">
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5" />
                    管理员
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              取消
            </Button>
            <Button type="submit" disabled={isPending} className="min-w-20">
              {isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                "创建"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Edit User Dialog
// ═══════════════════════════════════════════════════════════════════════════════

function EditUserDialog({
  user,
  open,
  onOpenChange,
}: {
  user: UserResponse | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<UserRole>(
    (user?.role as UserRole) ?? "user",
  );
  const [isActive, setIsActive] = useState(user?.is_active ?? true);
  const { mutate: updateUser, isPending } = useUpdateUser();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    updateUser(
      { userId: user.id, data: { name, email, role, is_active: isActive } },
      {
        onSuccess: () => {
          toast.success("用户信息已更新");
          onOpenChange(false);
        },
        onError: (error: Error) => {
          toast.error("更新失败", {
            description: error.message || "请稍后重试",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight">
            编辑用户
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          <div className="space-y-2.5">
            <Label htmlFor="edit-name" className="text-sm font-medium">
              姓名
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="pl-10"
              />
            </div>
          </div>
          <div className="space-y-2.5">
            <Label htmlFor="edit-email" className="text-sm font-medium">
              邮箱
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="edit-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="pl-10"
              />
            </div>
          </div>
          <div className="space-y-2.5">
            <Label className="text-sm font-medium">角色</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5" />
                    普通用户
                  </div>
                </SelectItem>
                <SelectItem value="admin">
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5" />
                    管理员
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-xl border bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${isActive ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
                  }`}
              >
                {isActive ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium">账号状态</p>
                <p className="text-xs text-muted-foreground">
                  {isActive ? "用户可正常访问系统" : "用户已被停用"}
                </p>
              </div>
            </div>
            <Switch
              id="edit-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              取消
            </Button>
            <Button type="submit" disabled={isPending} className="min-w-20">
              {isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                "保存"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Reset Password Dialog
// ═══════════════════════════════════════════════════════════════════════════════

function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
}: {
  user: UserResponse | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const { mutate: resetPassword, isPending } = useResetUserPassword();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    resetPassword(
      { userId: user.id, newPassword },
      {
        onSuccess: () => {
          toast.success("密码重置成功");
          onOpenChange(false);
          setNewPassword("");
        },
        onError: (error: Error) => {
          toast.error("重置失败", {
            description: error.message || "请稍后重试",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight">
            重置密码
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">目标用户</p>
            <p className="mt-1 font-medium">{user?.name}</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
          <div className="space-y-2.5">
            <Label htmlFor="new-password" className="text-sm font-medium">
              新密码
            </Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              placeholder="至少 6 位字符"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              取消
            </Button>
            <Button type="submit" disabled={isPending} className="min-w-20">
              {isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                "重置"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Delete User Alert Dialog
// ═══════════════════════════════════════════════════════════════════════════════

function DeleteUserAlertDialog({
  user,
  open,
  onOpenChange,
}: {
  user: UserResponse | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { mutate: deleteUser, isPending } = useDeleteUser();

  const handleConfirm = () => {
    if (!user) return;
    deleteUser(user.id, {
      onSuccess: () => {
        toast.success("用户已删除");
        onOpenChange(false);
      },
      onError: (error: Error) => {
        toast.error("删除失败", {
          description: error.message || "请稍后重试",
        });
      },
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl font-semibold tracking-tight">
            确认删除
          </AlertDialogTitle>
          <AlertDialogDescription className="pt-2">
            确定要删除用户 <strong className="text-foreground">{user?.name}</strong> 吗？
            <br />
            <span className="text-muted-foreground">{user?.email}</span>
            <p className="mt-3 text-sm text-destructive">
              此操作不可撤销，用户的所有数据将被永久删除。
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            确认删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Empty State Component
// (extracted to ./UsersEmptyState.tsx)
// ═══════════════════════════════════════════════════════════════════════════════

// Main Users Page
// ═══════════════════════════════════════════════════════════════════════════════

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
    []
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
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 w-24 cursor-pointer"
                  onClick={() => refetch()}
                  disabled={isLoading}
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                  刷新
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button size="sm" className="gap-2 w-24 cursor-pointer" onClick={() => setCreateOpen(true)}>
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
            <UsersEmptyState search={search} onCreate={() => setCreateOpen(true)} />
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
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30 border-b border-border/50">
                    <TableHead className="w-14 pl-5 text-center">
                      <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
                        ID
                      </span>
                    </TableHead>
                    <TableHead className="pl-4">
                      <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
                        用户名
                      </span>
                    </TableHead>
                    <TableHead>
                      <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
                        邮箱
                      </span>
                    </TableHead>
                    <TableHead className="w-22.5 text-center">
                      <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
                        角色
                      </span>
                    </TableHead>
                    <TableHead className="w-20 text-center">
                      <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
                        状态
                      </span>
                    </TableHead>
                    <TableHead className="w-37.5 text-center">
                      <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="size-3" />
                          创建时间
                        </span>
                      </span>
                    </TableHead>
                    <TableHead className="w-37.5 text-center">
                      <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="size-3" />
                          更新时间
                        </span>
                      </span>
                    </TableHead>
                    <TableHead className="w-10 pr-5" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user, i) => (
                    <TableRow
                      key={user.id}
                      className="group border-b border-border/30 last:border-0 transition-all duration-150 hover:bg-muted/20"
                      style={{
                        animationDelay: `${i * 0.02}s`,
                      }}
                    >
                      <TableCell className="py-3 pl-5 text-center">
                        <span className="font-mono text-[12px] text-muted-foreground/60 tabular-nums">
                          {user.id}
                        </span>
                      </TableCell>
                      <TableCell className="text-[13px] py-3 pl-4">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="size-8 shrink-0 border-2 border-background shadow-sm">
                            <AvatarFallback
                              className={cn(
                                "text-[10px] font-medium text-white",
                                avatarColor(user.id),
                              )}
                            >
                              {getInitials(user.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-foreground/80">
                            {user.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-[13px] py-3 text-muted-foreground/70">
                        {user.email}
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        <Badge
                          variant={user.role === "admin" ? "secondary" : "outline"}
                          className={cn(
                            "text-[11px] font-medium rounded-lg px-2.5 py-0.5",
                            user.role === "admin"
                              ? "bg-violet-50 text-violet-700 border-violet-200/50 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800/40"
                              : "bg-slate-100 text-slate-600 border-slate-200/50 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700/50",
                          )}
                        >
                          {user.role === "admin" ? "管理员" : "普通用户"}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        {user.is_active ? (
                          <Badge
                            className={cn(
                              "text-[11px] font-medium rounded-lg px-2.5 py-0.5",
                              "bg-emerald-50 text-emerald-700 border-emerald-200/50 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/40",
                            )}
                          >
                            <span className="mr-1.5 size-1.5 rounded-full bg-emerald-500 inline-block" />
                            激活
                          </Badge>
                        ) : (
                          <Badge
                            className={cn(
                              "text-[11px] font-medium rounded-lg px-2.5 py-0.5",
                              "bg-slate-100 text-slate-500 border-slate-200/50 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700/40",
                            )}
                          >
                            <span className="mr-1.5 size-1.5 rounded-full bg-slate-400 inline-block" />
                            停用
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-[13px] text-muted-foreground/60 py-3 text-center tabular-nums">
                        {formatDateTime(user.created_at)}
                      </TableCell>
                      <TableCell className="text-[13px] text-muted-foreground/60 py-3 text-center tabular-nums">
                        {formatDateTime(user.updated_at)}
                      </TableCell>
                      <TableCell className="py-3 pr-5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 opacity-0 group-hover:opacity-100 transition-all duration-150 rounded-lg"
                            >
                              <GripHorizontal className="size-3.5 text-muted-foreground/60" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40 rounded-xl" sideOffset={4}>
                            <DropdownMenuItem onClick={() => handleEdit(user)} className="text-[13px] cursor-pointer rounded-lg">
                              <Pencil className="size-3.5 mr-2.5" />
                              编辑
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleResetPassword(user)} className="text-[13px] cursor-pointer rounded-lg">
                              <KeyRound className="size-3.5 mr-2.5" />
                              重置密码
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDelete(user)}
                              className="text-[13px] cursor-pointer text-destructive focus:text-destructive rounded-lg"
                            >
                              <Trash2 className="size-3.5 mr-2.5" />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer: Stats + Pagination */}
      {!isLoading && !error && users.length > 0 && (
        <motion.div variants={itemVariants}>
          <PaginationFooter
            currentPage={page}
            totalPages={totalPages}
            total={totalItems}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            itemLabel="个用户"
            note={search ? <span className="text-muted-foreground/40">（筛选中）</span> : undefined}
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
