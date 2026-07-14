import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  RefreshCw,
  Search,
  X,
  ArrowUp,
  ArrowDown,
  Database,
  Box,
  FileCode2,
  Smile,
  Globe,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListFooter } from "@/components/shared/ListFooter";
import { RepoGrid, RepositoryFilterShell } from "@/components/repo";
import { PageHeader } from "@/components/shared/PageHeader";
import { useRepoList } from "@/hooks/api/use-repo-queries";
import type { RepoProfile, RepoStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { REPO_STATUS_CONFIG } from "@/lib/constants/repo";

const PAGE_SIZE = 20;

interface RepoListState {
  modelSource: "huggingface" | "modelscope";
  repoType: "all" | "model" | "dataset";
  search: string;
  statuses: RepoStatus[];
  sortBy: string;
  sortOrder: string;
  page: number;
}

// 状态配置：从全局 REPO_STATUS_CONFIG 派生，圆点色采用 canonical dotClass
const STATUS_CONFIG: {
  value: RepoStatus;
  label: string;
  dotColor: string;
}[] = (
  ["active", "updating", "cleaning", "inactive", "cleaned"] as RepoStatus[]
).map((value) => ({
  value,
  label: REPO_STATUS_CONFIG[value].label,
  dotColor: REPO_STATUS_CONFIG[value].dotClass,
}));

// 默认选中的状态（不包含 inactive）
const DEFAULT_STATUSES: RepoStatus[] = ["active", "updating", "cleaning"];

const DEFAULT_STATE: RepoListState = {
  modelSource: "huggingface",
  repoType: "all",
  search: "",
  statuses: DEFAULT_STATUSES,
  sortBy: "cache_updated_at",
  sortOrder: "desc",
  page: 1,
};

/** statuses 是否等于默认集合（顺序无关）。 */
function isDefaultStatuses(statuses: RepoStatus[]): boolean {
  return (
    statuses.length === DEFAULT_STATUSES.length &&
    statuses.every((s) => DEFAULT_STATUSES.includes(s))
  );
}

/**
 * 从 URL 参数解析列表筛选状态。
 * - 参数缺省 → 使用默认值；
 * - statuses 缺省 → DEFAULT_STATUSES；statuses 为空串 → 空选区（保留"全不选"语义）。
 */
function parseStateFromParams(params: URLSearchParams): RepoListState {
  const statusesParam = params.get("statuses");
  const statuses =
    statusesParam === null
      ? DEFAULT_STATUSES
      : statusesParam === ""
        ? []
        : (statusesParam.split(",").filter(Boolean) as RepoStatus[]);
  return {
    modelSource:
      params.get("source") === "modelscope"
        ? "modelscope"
        : DEFAULT_STATE.modelSource,
    repoType:
      (params.get("type") as RepoListState["repoType"]) ?? DEFAULT_STATE.repoType,
    search: params.get("search") ?? "",
    statuses,
    sortBy: params.get("sort") ?? DEFAULT_STATE.sortBy,
    sortOrder: params.get("order") ?? DEFAULT_STATE.sortOrder,
    page: Number(params.get("page")) || 1,
  };
}

export function RepositoriesConsole() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // 筛选/分页状态走 URL（可分享、刷新不丢失）
  const repoListState = parseStateFromParams(searchParams);

  const updateState = useCallback(
    (patch: Partial<RepoListState>) => {
      setSearchParams(
        (prev) => {
          const merged = { ...parseStateFromParams(prev), ...patch };
          const next = new URLSearchParams();
          if (merged.modelSource !== DEFAULT_STATE.modelSource)
            next.set("source", merged.modelSource);
          if (merged.repoType !== DEFAULT_STATE.repoType)
            next.set("type", merged.repoType);
          if (merged.search !== "") next.set("search", merged.search);
          if (!isDefaultStatuses(merged.statuses))
            next.set("statuses", merged.statuses.join(","));
          if (merged.sortBy !== DEFAULT_STATE.sortBy)
            next.set("sort", merged.sortBy);
          if (merged.sortOrder !== DEFAULT_STATE.sortOrder)
            next.set("order", merged.sortOrder);
          if (merged.page !== 1) next.set("page", String(merged.page));
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const [debouncedSearch, setDebouncedSearch] = useState(repoListState.search);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(repoListState.search);
    }, 300);
    return () => clearTimeout(timer);
  }, [repoListState.search]);

  const { data, isLoading, error, refetch } = useRepoList({
    modelSource: repoListState.modelSource,
    repoType: repoListState.repoType,
    skip: (repoListState.page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    statuses:
      repoListState.statuses.length > 0 ? repoListState.statuses : undefined,
    sort_by: repoListState.sortBy,
    sort_order: repoListState.sortOrder,
  });

  const repositories = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const toggleStatus = (status: RepoStatus) => {
    const next = repoListState.statuses.includes(status)
      ? repoListState.statuses.filter((s) => s !== status)
      : [...repoListState.statuses, status];
    updateState({ statuses: next, page: 1 });
  };

  const handleRepoTypeChange = (value: string) => {
    updateState({
      repoType: value as RepoListState["repoType"],
      page: 1,
    });
  };

  const handleViewDetail = (repo: RepoProfile) => {
    navigate(
      `/console/repositories/detail?repoId=${encodeURIComponent(repo.repo_id)}&type=${repo.repo_type}&source=${repoListState.modelSource}`,
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

      {/* 数据源切换 */}
      <Tabs
        value={repoListState.modelSource}
        onValueChange={(v) =>
          updateState({
            modelSource: v as RepoListState["modelSource"],
            page: 1,
          })
        }
      >
        <TabsList>
          <TabsTrigger value="huggingface">
            <Smile className="mr-2 h-4 w-4" />
            Huggingface
          </TabsTrigger>
          <TabsTrigger value="modelscope">
            <Globe className="mr-2 h-4 w-4" />
            Modelscope
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filter bar */}
      <RepositoryFilterShell>
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
          <Select
            value={repoListState.repoType}
            onValueChange={handleRepoTypeChange}
          >
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
          <Select
            value={repoListState.sortBy}
            onValueChange={(v) => updateState({ sortBy: v })}
          >
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
            onClick={() =>
              updateState({
                sortOrder: repoListState.sortOrder === "asc" ? "desc" : "asc",
              })
            }
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
      </RepositoryFilterShell>

      <RepoGrid
        repos={repositories}
        isLoading={isLoading}
        error={error}
        onViewDetail={handleViewDetail}
        onRetry={refetch}
        columns={3}
      />

      {!isLoading && totalPages > 0 && (
        <ListFooter
          currentPage={repoListState.page}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={(p) => updateState({ page: p })}
          itemLabel="个仓库"
          className="pt-2"
        />
      )}
    </div>
  );
}

export default RepositoriesConsole;
