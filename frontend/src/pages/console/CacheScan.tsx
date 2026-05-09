import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ScanSearch,
  RefreshCw,
  Database,
  Clock,
  HardDrive,
  AlertCircle,
  ArrowUpRight,
  Search,
  Copy,
  Check,
  X,
  MoreHorizontal,
  ShieldCheck,
  Filter,
  Trash2,
  Loader2,
  AlertTriangle,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn, formatBytes } from "@/lib/utils";
import api from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useCacheScanResult, useTriggerCacheScan } from "@/hooks/api/use-cache-scan-queries";
import type { RepoScanItem, ScanCategory, ScanResultResponse } from "@/lib/api-types";
import { queryKeys } from "@/lib/query-keys";

// =============================================================================
// Constants
// =============================================================================

const THRESHOLD_PRESETS = [30, 60, 90, 180];

const repoTypeLabels: Record<string, string> = {
  model: "模型",
  dataset: "数据集",
};

const repoTypeBadgeVariants: Record<string, "secondary" | "outline"> = {
  model: "secondary",
  dataset: "outline",
};

// =============================================================================
// Animation Variants
// =============================================================================

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
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

// =============================================================================
// Utility Functions
// =============================================================================

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("zh-CN");
}

// =============================================================================
// Sub-Components
// =============================================================================

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 flex-1 max-w-sm" />
          <Skeleton className="h-4 w-20 ml-auto" />
        </div>
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-6 py-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 py-3 border-b border-border/40 last:border-0"
            >
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16 ml-auto" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-36" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  isAdmin,
  onTrigger,
  isPending,
}: {
  isAdmin: boolean;
  onTrigger: () => void;
  isPending: boolean;
}) {
  return (
    <div className="flex min-h-[320px] items-center justify-center">
      <div className="text-center">
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl bg-muted p-5 mb-4 mx-auto w-fit"
        >
          <ScanSearch className="size-8 text-muted-foreground" />
        </motion.div>
        <motion.p
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="text-sm font-medium"
        >
          暂无扫描结果
        </motion.p>
        <motion.p
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-sm text-muted-foreground mt-1"
        >
          系统每日凌晨 3:00 自动扫描，或由管理员手动触发
        </motion.p>
        {isAdmin && (
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.25 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="mt-4"
          >
            <Button
              variant="outline"
              size="sm"
              onClick={onTrigger}
              disabled={isPending}
              className="gap-2 cursor-pointer"
            >
              <RefreshCw className={cn("size-4", isPending && "animate-spin")} />
              {isPending ? "扫描中..." : "立即扫描"}
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[320px] items-center justify-center">
      <div className="text-center">
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3 }}
          className="text-destructive mb-3"
        >
          <AlertCircle className="size-10 mx-auto" />
        </motion.div>
        <p className="text-sm text-muted-foreground">加载扫描结果失败</p>
        <p className="text-xs text-muted-foreground/70 mt-1">请检查网络连接后重试</p>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button variant="outline" size="sm" className="mt-3 gap-2 cursor-pointer" onClick={onRetry}>
            <RefreshCw className="size-3.5" />
            重试
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

function AllClearState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-3 p-4">
          <div className="size-9 rounded-lg bg-emerald-500/15 flex items-center justify-center">
            <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-medium">暂无冷数据仓库或孤儿存储</p>
            <p className="text-xs text-muted-foreground/70">所有仓库均处于活跃下载状态，无孤儿存储</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function CacheScan() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const { result, isLoading, isError, refetch } = useCacheScanResult();
  const triggerScan = useTriggerCacheScan();
  const [thresholdDays, setThresholdDays] = useState(15);
  const [customDays, setCustomDays] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | ScanCategory>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRepoId, setDeletingRepoId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hardDelete, setHardDelete] = useState(false);
  const queryClient = useQueryClient();

  const actualThreshold = useMemo(() => {
    if (customDays && Number(customDays) > 0) return Number(customDays);
    return thresholdDays;
  }, [thresholdDays, customDays]);

  const filteredRepos = useMemo(() => {
    if (!result) return [];
    let repos = result.repos;
    const q = search.trim().toLowerCase();
    if (q) {
      repos = repos.filter(
        (r) =>
          r.repo_id.toLowerCase().includes(q) ||
          (r.pipeline_tag && r.pipeline_tag.toLowerCase().includes(q)),
      );
    }
    if (typeFilter !== "all") {
      repos = repos.filter((r) => r.repo_type === typeFilter);
    }
    if (categoryFilter !== "all") {
      repos = repos.filter((r) => r.category === categoryFilter);
    }
    return repos;
  }, [result, search, typeFilter, categoryFilter]);

  const handleTrigger = () => {
    setDialogOpen(false);
    triggerScan.mutate(actualThreshold, {
      onSuccess: (data) => {
        toast.success(
          `扫描完成：发现 ${data.data?.total_cold_repos ?? 0} 个冷仓库，${data.data?.total_orphan_repos ?? 0} 个孤儿仓库`,
        );
      },
      onError: () => {
        toast.error("扫描失败，请重试");
      },
    });
  };

  const handleCopy = (repoId: string) => {
    navigator.clipboard.writeText(repoId).then(() => {
      setCopiedId(repoId);
      toast.success("已复制仓库 ID");
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleDeleteClick = (repoId: string) => {
    setDeletingRepoId(repoId);
    setDeleteDialogOpen(true);
    setHardDelete(false);
  };

  const handleConfirmDelete = async () => {
    if (!deletingRepoId) return;
    setIsDeleting(true);
    try {
      const endpoint = `/hf_repo/${encodeURIComponent(deletingRepoId)}`;
      await api.delete(endpoint, { params: { hard: hardDelete } });
      toast.success(hardDelete ? "仓库已彻底删除" : "仓库已删除");

      // Optimistically remove the deleted repo from cached scan result
      queryClient.setQueryData<ScanResultResponse>(
        queryKeys.cacheScan.result(),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            data: {
              ...old.data,
              repos: old.data.repos.filter((r) => r.repo_id !== deletingRepoId),
              total_cold_repos:
                old.data.repos.find((r) => r.repo_id === deletingRepoId)?.category === "cold"
                  ? old.data.total_cold_repos - 1
                  : old.data.total_cold_repos,
              total_orphan_repos:
                old.data.repos.find((r) => r.repo_id === deletingRepoId)?.category === "orphan"
                  ? old.data.total_orphan_repos - 1
                  : old.data.total_orphan_repos,
            },
          };
        },
      );

      setDeleteDialogOpen(false);
      setDeletingRepoId(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "删除失败，请重试";
      toast.error(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <motion.div
      className="flex flex-1 flex-col gap-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div
        variants={itemVariants}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center">
            <ScanSearch className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">缓存扫描</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              检测冷数据仓库和孤儿存储，优化存储空间
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <ToggleGroup
                type="single"
                value={customDays ? "" : String(thresholdDays)}
                onValueChange={(v) => {
                  if (v) {
                    setCustomDays("");
                    setThresholdDays(Number(v));
                  }
                }}
                variant="outline"
                size="sm"
                spacing={0}
              >
                {THRESHOLD_PRESETS.map((d) => (
                  <ToggleGroupItem
                    key={d}
                    value={String(d)}
                    className="h-8 px-2.5 text-[12px]"
                  >
                    {d}天
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <Input
                type="number"
                min={1}
                max={365}
                placeholder="自定义"
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
                className="w-[72px] h-8 text-[12px]"
              />
              <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <AlertDialogTrigger asChild>
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      variant="default"
                      size="sm"
                      disabled={triggerScan.isPending}
                      className="gap-2 cursor-pointer text-[13px] h-8"
                    >
                      <RefreshCw
                        className={cn("size-3.5", triggerScan.isPending && "animate-spin")}
                      />
                      {triggerScan.isPending ? "扫描中..." : "触发扫描"}
                    </Button>
                  </motion.div>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>确认触发扫描</AlertDialogTitle>
                    <AlertDialogDescription>
                      使用{" "}
                      <span className="font-semibold text-foreground">
                        {actualThreshold} 天
                      </span>{" "}
                      作为冷数据阈值进行全量扫描，同时检测孤儿存储。此操作可能需要几分钟。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={handleTrigger}>
                      {triggerScan.isPending ? "扫描中..." : "开始扫描"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-2 w-24 cursor-pointer text-[13px] h-8"
            >
              <RefreshCw className="size-3.5" />
              刷新
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {/* Error State */}
        {isError && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <ErrorState onRetry={() => refetch()} />
          </motion.div>
        )}

        {/* Loading State */}
        {isLoading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <LoadingSkeleton />
          </motion.div>
        )}

        {/* Empty State */}
        {!isLoading && !isError && !result && (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
          >
            <EmptyState
              isAdmin={isAdmin}
              onTrigger={handleTrigger}
              isPending={triggerScan.isPending}
            />
          </motion.div>
        )}

        {/* Results */}
        {result && (
          <motion.div
            key="results"
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6"
          >
            {/* Inline Stats */}
            <motion.div
              variants={itemVariants}
              className="flex items-stretch gap-6"
            >
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-blue-500/10 border border-blue-500/15 flex items-center justify-center">
                  <Clock className="size-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    扫描完成时间
                  </p>
                  <p className="text-lg font-bold tracking-tight tabular-nums">
                    {formatDate(result.scanned_at)}
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    {formatRelativeTime(result.scanned_at)}
                  </p>
                </div>
              </div>

              <Separator orientation="vertical" className="h-12" />

              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "size-10 rounded-xl flex items-center justify-center border",
                    result.total_cold_repos > 0
                      ? "bg-red-500/10 border-red-500/15"
                      : "bg-emerald-500/10 border-emerald-500/15",
                  )}
                >
                  <Database
                    className={cn(
                      "size-5",
                      result.total_cold_repos > 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-emerald-600 dark:text-emerald-400",
                    )}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    冷仓库数量
                  </p>
                  <p
                    className={cn(
                      "text-lg font-bold tracking-tight tabular-nums",
                      result.total_cold_repos > 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    {formatNumber(result.total_cold_repos)}
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    {result.total_cold_repos > 0 ? "活跃但长期无下载" : "所有仓库均活跃"}
                  </p>
                </div>
              </div>

              <Separator orientation="vertical" className="h-12" />

              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "size-10 rounded-xl flex items-center justify-center border",
                    result.total_orphan_repos > 0
                      ? "bg-amber-500/10 border-amber-500/15"
                      : "bg-emerald-500/10 border-emerald-500/15",
                  )}
                >
                  <Database
                    className={cn(
                      "size-5",
                      result.total_orphan_repos > 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-emerald-600 dark:text-emerald-400",
                    )}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    孤儿仓库数量
                  </p>
                  <p
                    className={cn(
                      "text-lg font-bold tracking-tight tabular-nums",
                      result.total_orphan_repos > 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    {formatNumber(result.total_orphan_repos)}
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    {result.total_orphan_repos > 0 ? "已失效的残留存储" : "无孤儿存储"}
                  </p>
                </div>
              </div>

              <Separator orientation="vertical" className="h-12" />

              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-violet-500/10 border border-violet-500/15 flex items-center justify-center">
                  <HardDrive className="size-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    缓存占用
                  </p>
                  <p className="text-lg font-bold tracking-tight tabular-nums">
                    {formatBytes(result.total_wasted_bytes)}
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    {(result.total_cold_repos + result.total_orphan_repos) > 0 ? (
                      <>
                        涉及{" "}
                        <span className="font-medium text-foreground/80">
                          {formatNumber(result.total_cold_repos + result.total_orphan_repos)}
                        </span>{" "}
                        个仓库
                      </>
                    ) : (
                      "缓存占用正常"
                    )}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* All Clear */}
            {result.total_cold_repos === 0 && result.total_orphan_repos === 0 && <AllClearState />}

            {/* Filter Bar */}
            {(result.total_cold_repos > 0 || result.total_orphan_repos > 0) && (
              <motion.div
                className="rounded-xl border bg-card p-4"
                variants={itemVariants}
                whileHover={{
                  boxShadow: "0 4px 20px -4px rgba(0, 0, 0, 0.08)",
                }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <motion.div whileHover={{ scale: 1.01 }} className="relative">
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="w-36 h-9">
                        <div className="flex items-center gap-2">
                          <Filter className="size-3.5 text-muted-foreground" />
                          <SelectValue placeholder="类型" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部类型</SelectItem>
                        <SelectItem value="model">模型</SelectItem>
                        <SelectItem value="dataset">数据集</SelectItem>
                      </SelectContent>
                    </Select>
                  </motion.div>

                  <ToggleGroup
                    type="single"
                    value={categoryFilter}
                    onValueChange={(v) => {
                      if (v) setCategoryFilter(v as "all" | ScanCategory);
                    }}
                    variant="outline"
                    size="sm"
                    spacing={0}
                  >
                    <ToggleGroupItem value="all" className="h-8 px-2.5 text-[12px]">
                      全部
                    </ToggleGroupItem>
                    <ToggleGroupItem value="cold" className="h-8 px-2.5 text-[12px]">
                      冷仓库
                    </ToggleGroupItem>
                    <ToggleGroupItem value="orphan" className="h-8 px-2.5 text-[12px]">
                      孤儿
                    </ToggleGroupItem>
                  </ToggleGroup>

                  <div className="relative flex-1 min-w-50 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                    <Input
                      type="search"
                      placeholder="搜索仓库 ID 或标签..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 h-9 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${filteredRepos.length}-${result.repos.length}`}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="ml-auto text-sm text-muted-foreground"
                    >
                      共{" "}
                      <span className="font-medium text-foreground">
                        {formatNumber(filteredRepos.length)}
                      </span>{" "}
                      个仓库
                      {filteredRepos.length !== result.repos.length && (
                        <>
                          {" "}
                          /{" "}
                          <span className="font-medium text-foreground">
                            {formatNumber(result.repos.length)}
                          </span>
                        </>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

            {/* Data Table */}
            {(result.total_cold_repos > 0 || result.total_orphan_repos > 0) && (
              <motion.div
                className="rounded-xl border bg-card overflow-hidden"
                variants={itemVariants}
              >
                {filteredRepos.length === 0 ? (
                  <div className="flex h-64 items-center justify-center">
                    <div className="text-center">
                      <motion.div
                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="rounded-2xl bg-muted p-5 mb-4 mx-auto w-fit"
                      >
                        <Search className="size-8 text-muted-foreground" />
                      </motion.div>
                      <motion.p
                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.15 }}
                        className="text-sm text-muted-foreground"
                      >
                        未找到匹配{" "}
                        <span className="font-mono font-medium text-foreground/60">
                          &quot;{search}&quot;
                        </span>{" "}
                        的仓库
                      </motion.p>
                      <motion.div
                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSearch("");
                            setTypeFilter("all");
                            setCategoryFilter("all");
                          }}
                          className="mt-3 gap-2 cursor-pointer"
                        >
                          清除所有筛选
                        </Button>
                      </motion.div>
                    </div>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border/50">
                        <TableHead className="w-75 pl-4 font-semibold text-xs">
                          仓库 ID
                        </TableHead>
                        <TableHead className="w-17.5 font-semibold text-xs text-center">
                          分类
                        </TableHead>
                        <TableHead className="w-20 font-semibold text-xs text-center">
                          类型
                        </TableHead>
                        <TableHead className="w-22.5 text-center font-semibold text-xs">
                          下载量
                        </TableHead>
                        <TableHead className="w-20 text-center font-semibold text-xs">
                          快照
                        </TableHead>
                        <TableHead className="w-22.5 text-center font-semibold text-xs">
                          缓存
                        </TableHead>
                        <TableHead className="w-37.5 font-semibold text-xs text-center">
                          最后下载
                        </TableHead>
                        <TableHead className="w-37.5 font-semibold text-xs text-center">
                          缓存更新时间
                        </TableHead>
                        <TableHead className="w-10 pr-4" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRepos.map((repo: RepoScanItem) => (
                        <TableRow
                          key={repo.repo_id}
                          className="group border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors"
                        >
                          <TableCell className="text-[13px] py-2.5 pl-4">
                            <TooltipProvider delayDuration={300}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(repo.repo_id)}
                                    className="font-mono font-medium text-left hover:text-primary transition-colors cursor-pointer rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring inline-flex items-center gap-1.5 max-w-70"
                                  >
                                    <span className="truncate">
                                      {repo.repo_id}
                                    </span>
                                    {copiedId === repo.repo_id ? (
                                      <Check className="size-3 text-emerald-500 shrink-0" />
                                    ) : (
                                      <Copy className="size-3 text-muted-foreground/0 group-hover:text-muted-foreground/40 shrink-0 transition-all" />
                                    )}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" align="start">
                                  <p className="text-xs">
                                    点击复制: {repo.repo_id}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>

                          <TableCell className="py-2.5 text-center">
                            <Badge
                              variant={repo.category === "cold" ? "destructive" : "outline"}
                              className={cn(
                                "text-[11px] font-medium",
                                repo.category === "orphan" && "border-amber-500/50 text-amber-700 dark:text-amber-400",
                              )}
                            >
                              {repo.category === "cold" ? "冷仓库" : "孤儿"}
                            </Badge>
                          </TableCell>

                          <TableCell className="py-2.5 text-center">
                            <Badge
                              variant={
                                repoTypeBadgeVariants[repo.repo_type] ??
                                "secondary"
                              }
                              className="text-[11px] font-medium"
                            >
                              {repoTypeLabels[repo.repo_type] ?? repo.repo_type}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-[13px] text-center tabular-nums py-2.5">
                            {formatNumber(repo.downloads)}
                          </TableCell>

                          <TableCell className="text-[13px] text-center tabular-nums py-2.5">
                            {formatNumber(repo.cached_commits)}
                          </TableCell>

                          <TableCell className="text-[13px] text-center tabular-nums py-2.5">
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-foreground/80 cursor-default">
                                    {formatBytes(repo.cached_size)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs tabular-nums">
                                    {repo.cached_size.toLocaleString("zh-CN")}{" "}
                                    字节
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>

                          <TableCell className="text-[13px] text-muted-foreground py-2.5 text-center">
                            {repo.last_downloaded_at ? (
                              <span className="text-muted-foreground/70">
                                {formatDate(repo.last_downloaded_at)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40 italic text-[12px]">
                                无记录
                              </span>
                            )}
                          </TableCell>

                          <TableCell className="text-[13px] text-muted-foreground py-2.5 text-center">
                            {repo.cache_updated_at ? (
                              <span className="text-muted-foreground/70">
                                {formatDate(repo.cache_updated_at)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40 italic text-[12px]">
                                无记录
                              </span>
                            )}
                          </TableCell>

                          <TableCell className="py-2.5 pr-4">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <MoreHorizontal className="size-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem
                                  onClick={() => handleCopy(repo.repo_id)}
                                  className="text-[13px] cursor-pointer"
                                >
                                  <Copy className="size-3.5 mr-2" />
                                  复制仓库 ID
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-[13px] cursor-pointer"
                                  onClick={() => {
                                    window.open(
                                      `https://huggingface.co/${repo.repo_id}`,
                                      "_blank",
                                    );
                                  }}
                                >
                                  <ArrowUpRight className="size-3.5 mr-2" />
                                  在 HF 查看
                                </DropdownMenuItem>
                                {isAdmin && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleDeleteClick(repo.repo_id)}
                                      className="text-[13px] cursor-pointer text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="size-3.5 mr-2" />
                                      删除仓库
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 删除仓库确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="sm:max-w-106.25">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-left">确认删除仓库</AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              您即将删除仓库{" "}
              <span className="font-semibold text-foreground">{deletingRepoId}</span>
              。{!hardDelete && "此操作将删除所有缓存的文件和版本数据。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="hard-delete"
                checked={hardDelete}
                onCheckedChange={(checked) => setHardDelete(checked === true)}
              />
              <Label
                htmlFor="hard-delete"
                className="flex-1 cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">彻底删除</span>
                  <span className="text-xs text-muted-foreground">
                    (同时删除数据库记录)
                  </span>
                </div>
              </Label>
            </div>
            {hardDelete && (
              <div className="mt-3 ml-6 space-y-1">
                <div className="flex items-start gap-2 text-xs text-destructive">
                  <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                  <span>此操作将从数据库完全移除仓库记录，所有数据将永久丢失！</span>
                </div>
                <ul className="ml-5 text-xs text-muted-foreground space-y-1 list-disc">
                  <li>从数据库完全移除仓库记录</li>
                  <li>从数据库删除所有文件树记录</li>
                  <li>从数据库删除所有版本快照</li>
                </ul>
              </div>
            )}
          </div>
          <AlertDialogFooter className="flex-row gap-3 sm:justify-end">
            <AlertDialogCancel
              disabled={isDeleting}
              className="flex-1 sm:flex-initial sm:min-w-25"
            >
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className={cn(
                "flex-1 sm:flex-initial sm:min-w-25",
                hardDelete
                  ? ""
                  : "border border-red-300 bg-transparent text-red-600 hover:bg-red-50 hover:border-red-400 dark:border-red-800/60 dark:text-red-400 dark:hover:bg-red-950/50",
              )}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {hardDelete ? "彻底删除中..." : "删除中..."}
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {hardDelete ? "确认彻底删除" : "确认删除"}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

export default CacheScan;