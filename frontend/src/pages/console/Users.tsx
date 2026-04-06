import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo, useEffect } from "react";
import {
  RefreshCw,
  Plus,
  MoreHorizontal,
  Pencil,
  KeyRound,
  Trash2,
  Search,
  Users2,
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
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useResetUserPassword,
} from "@/hooks/api/use-user-queries";
import type { UserResponse, UserRole } from "@/lib/api-types";

const PAGE_SIZE = 10;

// ═══════════════════════════════════════════════════════════════════════════════
// Animation Variants
// ═══════════════════════════════════════════════════════════════════════════════

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
      type: "spring" as const,
      stiffness: 100,
      damping: 20,
    },
  },
};

const tableRowVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 },
};

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

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-teal-500",
];

function avatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Loading Skeleton Component
// ═══════════════════════════════════════════════════════════════════════════════

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-28" />
        </div>
      ))}
    </div>
  );
}

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
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  isActive ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
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
// ═══════════════════════════════════════════════════════════════════════════════

function EmptyState({
  search,
  onCreate,
}: {
  search: string;
  onCreate: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="flex h-80 flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/20"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <Users2 className="h-8 w-8 text-muted-foreground/50" />
      </div>
      <h3 className="mt-4 text-lg font-medium">
        {search ? "未找到匹配用户" : "暂无用户"}
      </h3>
      <p className="mt-1 max-w-xs text-center text-sm text-muted-foreground">
        {search
          ? "尝试使用其他关键词搜索，或清除搜索条件查看全部用户"
          : "开始添加第一个用户来管理系统访问权限"}
      </p>
      {!search && (
        <Button size="sm" className="mt-4" onClick={onCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          新建用户
        </Button>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Users Page
// ═══════════════════════════════════════════════════════════════════════════════

export function Users() {
  const { data, isLoading, error, refetch } = useUsers();
  const users = useMemo(
    () => (data as unknown as UserResponse[]) ?? [],
    [data],
  );

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [resetPwdOpen, setResetPwdOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserResponse | null>(null);

  // Search debounce
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(timer);
  }, [search]);

  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return users;
    const q = debouncedSearch.toLowerCase();
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

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
      className="flex flex-1 flex-col"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div
        variants={itemVariants}
        className="mb-6 flex items-center justify-between"
      >
        <div>
          <div className="flex items-center gap-2">
            <motion.div
              initial={{ rotate: -10, scale: 0.9 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <UsersIcon className="size-5 text-primary" />
            </motion.div>
            <h1 className="text-2xl font-semibold tracking-tight">用户管理</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            管理系统用户账号和权限
          </p>
        </div>
        <div className="flex items-center gap-2">
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 w-24"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              刷新
            </Button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button size="sm" className="gap-2 w-24" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              新建用户
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Search Bar */}
      <motion.div variants={itemVariants} className="mb-6">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索姓名或邮箱..."
            className="pl-10"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {search && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => handleSearch("")}
            >
              <AlertCircle className="h-4 w-4" />
            </motion.button>
          )}
        </div>
      </motion.div>

      {/* User List */}
      <motion.div
        variants={itemVariants}
        className="flex-1 rounded-2xl border bg-card shadow-sm"
      >
        {isLoading ? (
          <div className="p-4">
            <TableSkeleton />
          </div>
        ) : error ? (
          <div className="flex h-80 items-center justify-center">
            <div className="text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 mx-auto">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <p className="mt-4 text-sm font-medium">加载失败</p>
              <p className="text-sm text-muted-foreground">
                无法获取用户列表，请稍后重试
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => refetch()}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                重试
              </Button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState search={search} onCreate={() => setCreateOpen(true)} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="w-12 pl-4 text-center font-semibold">
                    ID
                  </TableHead>
                  <TableHead className="font-semibold">用户名</TableHead>
                  <TableHead className="font-semibold">邮箱</TableHead>
                  <TableHead className="w-24 text-center font-semibold">
                    角色
                  </TableHead>
                  <TableHead className="w-24 text-center font-semibold">
                    状态
                  </TableHead>
                  <TableHead className="w-36 text-center font-semibold">
                    <div className="flex items-center justify-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      创建时间
                    </div>
                  </TableHead>
                  <TableHead className="w-36 text-center font-semibold">
                    <div className="flex items-center justify-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      更新时间
                    </div>
                  </TableHead>
                  <TableHead className="w-16 pr-4 text-center font-semibold">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence mode="popLayout">
                  {paginated.map((user, index) => (
                    <motion.tr
                      key={user.id}
                      variants={tableRowVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      transition={{
                        delay: index * 0.03,
                        type: "spring",
                        stiffness: 100,
                        damping: 20,
                      }}
                      className="group border-b transition-colors hover:bg-muted/30"
                    >
                      <TableCell className="pl-4 text-center">
                        <span className="font-mono text-xs text-muted-foreground">
                          {user.id}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 shrink-0 border-2 border-background shadow-sm">
                            <AvatarFallback
                              className={`text-xs font-medium text-white ${avatarColor(user.id)}`}
                            >
                              {getInitials(user.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{user.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.email}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={user.role === "admin" ? "default" : "secondary"}
                          className={`${
                            user.role === "admin"
                              ? "bg-violet-100 text-violet-700 hover:bg-violet-100 dark:bg-violet-950 dark:text-violet-300"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300"
                          }`}
                        >
                          {user.role === "admin" ? "管理员" : "普通用户"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {user.is_active ? (
                          <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                            <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            激活
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-50 text-slate-600 dark:bg-slate-950 dark:text-slate-400">
                            <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-slate-400" />
                            停用
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {formatDateTime(user.created_at)}
                      </TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {formatDateTime(user.updated_at)}
                      </TableCell>
                      <TableCell className="pr-4 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => handleEdit(user)}>
                              <Pencil className="mr-2 h-4 w-4 text-muted-foreground" />
                              编辑
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleResetPassword(user)}
                            >
                              <KeyRound className="mr-2 h-4 w-4 text-muted-foreground" />
                              重置密码
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDelete(user)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        )}
      </motion.div>

      {/* Footer: Stats + Pagination */}
      {!isLoading && !error && filtered.length > 0 && (
        <motion.div
          variants={itemVariants}
          className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-sm text-muted-foreground">
            显示 {(safePage - 1) * PAGE_SIZE + 1} -{" "}
            {Math.min(safePage * PAGE_SIZE, filtered.length)} 条，共{" "}
            {filtered.length} 个用户
            {search && `（筛选自 ${users.length} 个用户）`}
          </p>
          {totalPages > 1 && (
            <Pagination className="w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-disabled={safePage === 1}
                    className={
                      safePage === 1
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(
                    (p) =>
                      p === 1 || p === totalPages || Math.abs(p - safePage) <= 1,
                  )
                  .reduce<(number | "ellipsis")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && p - (arr[idx - 1] as number) > 1)
                      acc.push("ellipsis");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === "ellipsis" ? (
                      <PaginationItem key={`ellipsis-${idx}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={item}>
                        <PaginationLink
                          isActive={item === safePage}
                          onClick={() => setPage(item)}
                          className="cursor-pointer"
                        >
                          {item}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    aria-disabled={safePage === totalPages}
                    className={
                      safePage === totalPages
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
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
