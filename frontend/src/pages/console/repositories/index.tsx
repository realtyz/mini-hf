import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { RefreshCw, Search, ArrowUp, ArrowDown, Database, SlidersHorizontal, Box, FileCode2 } from "lucide-react";
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
  colorClass: string;
  dotColor: string;
}[] = [
    {
      value: "active",
      label: "活跃",
      colorClass: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
      dotColor: "bg-emerald-500",
    },
    {
      value: "updating",
      label: "更新中",
      colorClass: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800",
      dotColor: "bg-blue-500",
    },
    {
      value: "cleaning",
      label: "清理中",
      colorClass: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border-violet-200 dark:border-violet-800",
      dotColor: "bg-violet-500",
    },
    {
      value: "inactive",
      label: "不完整",
      colorClass: "bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-400 border-slate-200 dark:border-slate-700",
      dotColor: "bg-slate-400",
    },
    {
      value: "cleaned",
      label: "已清理",
      colorClass: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300 border-orange-200 dark:border-orange-800",
      dotColor: "bg-orange-500",
    },
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
            className="w-24 cursor-pointer gap-2 text-[13px] h-8"
          >
            <RefreshCw className="size-3.5" />
            刷新
          </Button>
        }
      />

      <div className="rounded-2xl border bg-card mb-6 overflow-hidden">
        <div className="p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-50 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/50" />
            <Input
              type="search"
              placeholder="搜索仓库名称..."
              className="pl-9 h-9 bg-muted/30 border-transparent focus:border-primary/30 focus:bg-background"
              value={repoListState.search}
              onChange={(e) => setRepoListState((prev) => ({ ...prev, search: e.target.value, page: 1 }))}
            />
          </div>

          <Select value={repoListState.repoType} onValueChange={handleRepoTypeChange}>
            <SelectTrigger className="w-32 h-9 bg-muted/30 border-transparent hover:border-border">
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

          <Select value={repoListState.sortBy} onValueChange={(v) => updateState({ sortBy: v })}>
            <SelectTrigger className="w-32 h-9 bg-muted/30 border-transparent hover:border-border">
              <SelectValue placeholder="排序方式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cache_updated_at">更新时间</SelectItem>
              <SelectItem value="downloads">下载量</SelectItem>
              <SelectItem value="last_downloaded_at">最近下载</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            className="size-9 bg-muted/30 border-transparent hover:border-border"
            onClick={() => updateState({ sortOrder: repoListState.sortOrder === "asc" ? "desc" : "asc" })}
            title={repoListState.sortOrder === "asc" ? "升序" : "降序"}
          >
            {repoListState.sortOrder === "asc" ? (
              <ArrowUp className="size-3.5" />
            ) : (
              <ArrowDown className="size-3.5" />
            )}
          </Button>
        </div>

        <div className="px-4 py-3 bg-muted/20 border-t border-border/50 flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            <SlidersHorizontal className="size-3.5" />
            状态
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_CONFIG.map((config) => {
              const isActive = repoListState.statuses.includes(config.value);
              return (
                <button
                  key={config.value}
                  type="button"
                  onClick={() => toggleStatus(config.value)}
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 h-7 w-16 rounded-full text-xs font-medium transition-all duration-200",
                    isActive
                      ? ["border shadow-sm", config.colorClass]
                      : "bg-transparent text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full transition-colors",
                      isActive ? config.dotColor : "bg-muted-foreground/30"
                    )}
                  />
                  {config.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <RepoGrid
        repos={repositories}
        isLoading={isLoading}
        error={error}
        onViewDetail={handleViewDetail}
      />

      {!isLoading && totalPages > 0 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            显示{" "}
            <span className="font-medium text-foreground">
              {Math.min((repoListState.page - 1) * PAGE_SIZE + 1, total)}-
              {Math.min(repoListState.page * PAGE_SIZE, total)}
            </span>{" "}
            个，共 <span className="font-medium text-foreground">{total}</span> 个仓库
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
