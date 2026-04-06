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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { RepoGrid } from "@/components/repo";
import { useRepoList, PAGE_SIZE } from "@/hooks/useRepoList";
import type { RepoProfile, RepoStatus } from "@/lib/api-types";
import { cn } from "@/lib/utils";

// sessionStorage key
const REPO_LIST_STATE_KEY = "repoListState";

// 状态类型定义
interface RepoListState {
  repoType: "all" | "model" | "dataset";
  search: string;
  statuses: RepoStatus[];
  sortBy: string;
  sortOrder: string;
  page: number;
}

// 从 sessionStorage 读取状态
function loadStateFromStorage(): Partial<RepoListState> | null {
  try {
    const saved = sessionStorage.getItem(REPO_LIST_STATE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // 忽略解析错误
  }
  return null;
}

// 保存状态到 sessionStorage
function saveStateToStorage(state: RepoListState) {
  try {
    sessionStorage.setItem(REPO_LIST_STATE_KEY, JSON.stringify(state));
  } catch {
    // 忽略存储错误
  }
}

type RepoTypeFilter = "all" | "model" | "dataset";

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
      label: "非活跃",
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

  // 从 sessionStorage 加载初始状态
  const savedState = loadStateFromStorage();

  const [repoType, setRepoType] = useState<RepoTypeFilter>(savedState?.repoType ?? "all");
  const [search, setSearch] = useState(savedState?.search ?? "");
  const [statuses, setStatuses] = useState<RepoStatus[]>(savedState?.statuses ?? DEFAULT_STATUSES);
  const [sortBy, setSortBy] = useState<string>(savedState?.sortBy ?? "cache_updated_at");
  const [sortOrder, setSortOrder] = useState<string>(savedState?.sortOrder ?? "desc");
  const [page, setPage] = useState(savedState?.page ?? 0);

  // 状态变化时保存到 sessionStorage
  useEffect(() => {
    saveStateToStorage({
      repoType,
      search,
      statuses,
      sortBy,
      sortOrder,
      page,
    });
  }, [repoType, search, statuses, sortBy, sortOrder, page]);

  const { data, isLoading, error, refetch } = useRepoList({
    repoType,
    skip: page * PAGE_SIZE,
    limit: PAGE_SIZE,
    search: search || undefined,
    statuses: statuses.length > 0 ? statuses : undefined,
    sort_by: sortBy,
    sort_order: sortOrder,
  });

  const repositories = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // 切换状态选择
  const toggleStatus = (status: RepoStatus) => {
    setStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status],
    );
    setPage(0);
  };

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      if (page !== 0) {
        setPage(0);
      } else {
        refetch();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, repoType, statuses, sortBy, sortOrder, page, refetch]);

  // 页面变化时重新获取数据
  useEffect(() => {
    refetch();
  }, [page, refetch]);

  const handleRepoTypeChange = (value: string) => {
    setRepoType(value as RepoTypeFilter);
    setPage(0);
  };

  const handleViewDetail = (repo: RepoProfile) => {
    // 确保状态已保存（尽管 useEffect 会自动保存，这里显式调用确保及时性）
    saveStateToStorage({
      repoType,
      search,
      statuses,
      sortBy,
      sortOrder,
      page,
    });
    navigate(
      `/console/repositories/detail?repoId=${encodeURIComponent(repo.repo_id)}&type=${repo.repo_type}`,
    );
  };

  return (
    <div className="flex flex-1 flex-col animate-fade-in-up">
      {/* 页面标题 - 改进设计 */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center">
              <Database className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">仓库管理</h1>
              <p className="text-[13px] text-muted-foreground mt-0.5">
                管理和浏览已缓存的模型与数据集
              </p>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="w-24 cursor-pointer gap-2 text-[13px] h-8"
        >
          <RefreshCw className="size-3.5" />
          刷新
        </Button>
      </div>

      {/* 筛选区 - 重新设计 */}
      <div className="rounded-2xl border bg-card mb-6 overflow-hidden">
        {/* 搜索和筛选行 */}
        <div className="p-4 flex flex-wrap items-center gap-3">
          {/* 搜索框 */}
          <div className="relative flex-1 min-w-50 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/50" />
            <Input
              type="search"
              placeholder="搜索仓库名称..."
              className="pl-9 h-9 bg-muted/30 border-transparent focus:border-primary/30 focus:bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* 类型筛选 */}
          <Select value={repoType} onValueChange={handleRepoTypeChange}>
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

          {/* 排序 */}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-32 h-9 bg-muted/30 border-transparent hover:border-border">
              <SelectValue placeholder="排序方式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cache_updated_at">更新时间</SelectItem>
              <SelectItem value="downloads">下载量</SelectItem>
              <SelectItem value="last_downloaded_at">最近下载</SelectItem>
            </SelectContent>
          </Select>

          {/* 排序方向 */}
          <Button
            variant="outline"
            size="icon"
            className="size-9 bg-muted/30 border-transparent hover:border-border"
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            title={sortOrder === "asc" ? "升序" : "降序"}
          >
            {sortOrder === "asc" ? (
              <ArrowUp className="size-3.5" />
            ) : (
              <ArrowDown className="size-3.5" />
            )}
          </Button>
        </div>

        {/* 状态筛选 - 改进样式 */}
        <div className="px-4 py-3 bg-muted/20 border-t border-border/50 flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            <SlidersHorizontal className="size-3.5" />
            状态
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_CONFIG.map((config) => {
              const isActive = statuses.includes(config.value);
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

      {/* 卡片列表 */}
      <RepoGrid
        repos={repositories}
        isLoading={isLoading}
        error={error}
        onViewDetail={handleViewDetail}
      />

      {/* 分页 */}
      {!isLoading && totalPages > 0 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            共 <span className="font-medium text-foreground">{total}</span> 个仓库
          </p>
          {totalPages > 1 && (
            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className={
                      page === 0
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <PaginationItem key={p}>
                    <PaginationLink
                      onClick={() => setPage(p - 1)}
                      isActive={page + 1 === p}
                      className="cursor-pointer"
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                ))}

                <PaginationItem>
                  <PaginationNext
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    className={
                      page >= totalPages - 1
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      )}
    </div>
  );
}

export default RepositoriesConsole;
