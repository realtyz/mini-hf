import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { RefreshCw, Search, X, ArrowUp, ArrowDown, Database, Box, FileCode2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PaginatedNavigation } from "@/components/shared/PaginatedNavigation";
import { RepoGrid } from "@/components/repo";
import { PageHeader } from "@/components/shared/PageHeader";
import { useRepoList, PAGE_SIZE } from "@/hooks/use-repo-list";
import { useSessionStorageState } from "@/hooks/use-session-storage-state";
import type { RepoProfile, RepoStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { itemVariants } from "@/lib/animations/motion-config";

const REPO_LIST_STATE_KEY = "repoListState";

interface RepoListState {
  repoType: "all" | "model" | "dataset";
  search: string;
  statuses: RepoStatus[];
  sortBy: string;
  sortOrder: string;
  page: number;
}

// 状态配置：显示名称和颜色
const STATUS_CONFIG: {
  value: RepoStatus;
  label: string;
  dotColor: string;
}[] = [
    { value: "active", label: "活跃", dotColor: "bg-emerald-500" },
    { value: "updating", label: "更新中", dotColor: "bg-blue-500" },
    { value: "cleaning", label: "清理中", dotColor: "bg-violet-500" },
    { value: "inactive", label: "不完整", dotColor: "bg-slate-400" },
    { value: "cleaned", label: "已清理", dotColor: "bg-orange-500" },
  ];

// 默认选中的状态（不包含 inactive）
const DEFAULT_STATUSES: RepoStatus[] = ["active", "updating", "cleaning"];

export function RepositoriesConsole() {
  const navigate = useNavigate();

  const [repoListState, setRepoListState] = useSessionStorageState<RepoListState>(
    REPO_LIST_STATE_KEY,
    {
      repoType: "all",
      search: "",
      statuses: DEFAULT_STATUSES,
      sortBy: "cache_updated_at",
      sortOrder: "desc",
      page: 1,
    }
  );

  const [debouncedSearch, setDebouncedSearch] = useState(repoListState.search);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(repoListState.search);
    }, 300);
    return () => clearTimeout(timer);
  }, [repoListState.search]);

  const { data, isLoading, error, refetch } = useRepoList({
    repoType: repoListState.repoType,
    skip: (repoListState.page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    statuses: repoListState.statuses.length > 0 ? repoListState.statuses : undefined,
    sort_by: repoListState.sortBy,
    sort_order: repoListState.sortOrder,
  });

  const repositories = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const updateState = (patch: Partial<RepoListState>) => {
    setRepoListState((prev) => ({ ...prev, ...patch }));
  };

  const toggleStatus = (status: RepoStatus) => {
    setRepoListState((prev) => ({
      ...prev,
      statuses: prev.statuses.includes(status)
        ? prev.statuses.filter((s) => s !== status)
        : [...prev.statuses, status],
      page: 1,
    }));
  };

  const handleRepoTypeChange = (value: string) => {
    setRepoListState((prev) => ({ ...prev, repoType: value as RepoListState["repoType"], page: 1 }));
  };

  const handleViewDetail = (repo: RepoProfile) => {
    navigate(
      `/console/repositories/detail?repoId=${encodeURIComponent(repo.repo_id)}&type=${repo.repo_type}`,
    );
  };

  return (
    <div className="flex flex-1 flex-col gap-6 animate-fade-in-up">
      <PageHeader
        icon={Database}
        title="仓库管理"
        subtitle="管理和浏览已缓存的模型与数据集"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="cursor-pointer gap-2 text-[13px] h-8"
          >
            <RefreshCw className="size-3.5" />
            刷新
          </Button>
        }
      />

      {/* Filter bar */}
      <motion.div
        className="relative rounded-2xl border border-border/60 bg-card overflow-hidden"
        variants={itemVariants}
        whileHover={{
          boxShadow: "0 4px 24px -6px rgba(0, 0, 0, 0.06)",
        }}
        transition={{ duration: 0.25 }}
      >
        {/* Subtle top accent line */}
        <div className="absolute top-0 left-4 right-4 h-px bg-linear-to-r from-transparent via-border/40 to-transparent" />

        {/* Row 1: Search + Type + Sort + Order + Count */}
        <div className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3">
          {/* Search */}
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/50 pointer-events-none" />
            <Input
              type="search"
              placeholder="搜索仓库名称..."
              value={repoListState.search}
              onChange={(e) => updateState({ search: e.target.value, page: 1 })}
              className="pl-9.5 h-9 rounded-xl border-border/60 text-[13px] transition-all duration-200 focus:ring-2 focus:ring-primary/15"
            />
            {repoListState.search && (
              <button
                type="button"
                onClick={() => updateState({ search: "", page: 1 })}
                className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40 hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Repo type */}
          <Select value={repoListState.repoType} onValueChange={handleRepoTypeChange}>
            <SelectTrigger className="w-32 h-9 rounded-xl border-border/60 text-[13px]">
              <SelectValue placeholder="仓库类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <span className="flex items-center gap-2">
                  <Database className="size-3.5" /> 全部
                </span>
              </SelectItem>
              <SelectItem value="model">
                <span className="flex items-center gap-2">
                  <Box className="size-3.5" /> 模型
                </span>
              </SelectItem>
              <SelectItem value="dataset">
                <span className="flex items-center gap-2">
                  <FileCode2 className="size-3.5" /> 数据集
                </span>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Sort */}
          <Select value={repoListState.sortBy} onValueChange={(v) => updateState({ sortBy: v })}>
            <SelectTrigger className="w-32 h-9 rounded-xl border-border/60 text-[13px]">
              <SelectValue placeholder="排序方式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cache_updated_at">更新时间</SelectItem>
              <SelectItem value="downloads">下载量</SelectItem>
              <SelectItem value="last_downloaded_at">最近下载</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort order toggle */}
          <Button
            variant="outline"
            size="icon"
            className="size-9 rounded-xl border-border/60"
            onClick={() => updateState({ sortOrder: repoListState.sortOrder === "asc" ? "desc" : "asc" })}
            title={repoListState.sortOrder === "asc" ? "升序" : "降序"}
          >
            {repoListState.sortOrder === "asc" ? (
              <ArrowUp className="size-3.5" />
            ) : (
              <ArrowDown className="size-3.5" />
            )}
          </Button>

          {/* Count */}
          <div className="ml-auto flex items-baseline gap-1.5">
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {total.toLocaleString()}
            </span>
            <span className="text-[13px] text-muted-foreground/50">个仓库</span>
          </div>
        </div>

        {/* Row 2: Status filter */}
        <div className="flex items-center gap-3 px-5 pb-4">
          <span className="text-[11px] font-medium text-muted-foreground/40 uppercase tracking-wider shrink-0 select-none">
            状态
          </span>
          <div className="flex items-center gap-1">
            {STATUS_CONFIG.map((config) => {
              const isActive = repoListState.statuses.includes(config.value);
              return (
                <button
                  key={config.value}
                  type="button"
                  onClick={() => toggleStatus(config.value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors duration-150 cursor-pointer select-none",
                    isActive
                      ? "bg-muted/60 text-foreground"
                      : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/30",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      isActive ? config.dotColor : "bg-muted-foreground/25",
                    )}
                  />
                  {config.label}
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>

      <RepoGrid
        repos={repositories}
        isLoading={isLoading}
        error={error}
        onViewDetail={handleViewDetail}
      />

      {!isLoading && totalPages > 0 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-[13px] text-muted-foreground/60 tabular-nums">
            <span className="font-medium text-foreground/80">
              {Math.min((repoListState.page - 1) * PAGE_SIZE + 1, total)}–{Math.min(repoListState.page * PAGE_SIZE, total)}
            </span>
            <span className="mx-1 text-muted-foreground/40">/</span>
            <span className="font-medium text-foreground/80">{total}</span>
          </p>
          {totalPages > 1 && (
            <PaginatedNavigation
              currentPage={repoListState.page}
              totalPages={totalPages}
              onPageChange={(p) => updateState({ page: p })}
              className="mx-0 w-auto"
            />
          )}
        </div>
      )}
    </div>
  );
}

export default RepositoriesConsole;
