import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  X,
  RefreshCw,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import api from "@/lib/api/client";
import endpoints from "@/lib/api/endpoints";
import type {
  RepoProfile,
  RepoListResponse,
  RepoListParams,
  RepoStatus,
} from "@/lib/api/types";
import { RepoGrid } from "@/components/repo";
import { PaginatedNavigation } from "@/components/shared/PaginatedNavigation";
import { motion } from "framer-motion";
import { itemVariants } from "@/lib/animations/motion-config";

const PAGE_SIZE = 16;

type RepoTypeFilter = "all" | "model" | "dataset";
type StatusFilter = "all" | RepoStatus;
type ModelSource = "huggingface" | "modelscope";

interface FetchReposParams extends RepoListParams {
  repoType: RepoTypeFilter;
  statusFilter: StatusFilter;
  modelSource: ModelSource;
}

async function fetchRepositories({
  repoType,
  statusFilter,
  modelSource,
  ...params
}: FetchReposParams): Promise<RepoListResponse> {
  const queryParams: Record<string, unknown> = { ...params };

  if (repoType !== "all") {
    queryParams.repo_type = repoType;
  }

  queryParams.statuses = [statusFilter];

  const endpoint =
    modelSource === "huggingface" ? endpoints.repo.hfListPublic : endpoints.repo.msList;
  return api.get<RepoListResponse>(endpoint, {
    params: queryParams,
    paramsSerializer: {
      indexes: null,
    },
  });
}

export function Repositories() {
  const navigate = useNavigate();
  const [repoType, setRepoType] = useState<RepoTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [modelSource, setModelSource] = useState<ModelSource>("huggingface");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      "repositories",
      { modelSource, repoType, statusFilter, search: debouncedSearch, page },
    ],
    queryFn: () =>
      fetchRepositories({
        modelSource,
        repoType,
        statusFilter,
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
      }),
  });

  const repositories = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleModelSourceChange = (value: string) => {
    setModelSource(value as ModelSource);
    setPage(0);
  };

  const handleRepoTypeChange = (value: string) => {
    setRepoType(value as RepoTypeFilter);
    setPage(0);
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value as StatusFilter);
    setPage(0);
  };

  const handleViewDetail = (repo: RepoProfile) => {
    navigate(
      `/repositories/detail?repoId=${encodeURIComponent(repo.repo_id)}&type=${repo.repo_type}`,
    );
  };

  return (
    <div className="container mx-auto flex flex-1 flex-col px-4 py-8">
      {/* 页面标题 */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">仓库列表</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            浏览已缓存的模型与数据集
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-24 cursor-pointer"
          onClick={() => refetch()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          刷新
        </Button>
      </div>

      {/* 筛选区域 */}
      <div className="mb-6 space-y-4">
        {/* 模型来源切换 */}
        <Tabs value={modelSource} onValueChange={handleModelSourceChange}>
          <TabsList>
            <TabsTrigger value="huggingface">
              <Smile className="mr-2 h-4 w-4" />
              Huggingface
            </TabsTrigger>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger value="modelscope" disabled>
                  <Globe className="mr-2 h-4 w-4" />
                  Modelscope
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent>暂不可用</TooltipContent>
            </Tooltip>
          </TabsList>
        </Tabs>

        {/* 搜索和筛选 */}
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

          <div className="flex flex-wrap items-center gap-3 px-5 py-4">
            <div className="relative flex-1 min-w-50 max-w-sm">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/50 pointer-events-none" />
              <Input
                type="search"
                placeholder="搜索仓库名称..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9.5 h-9 rounded-xl border-border/60 text-[13px] transition-all duration-200 focus:ring-2 focus:ring-primary/15"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40 hover:text-foreground transition-colors cursor-pointer"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <Select value={repoType} onValueChange={handleRepoTypeChange}>
              <SelectTrigger className="w-30 h-9 rounded-xl border-border/60 text-[13px]">
                <SelectValue placeholder="类型筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="model">模型</SelectItem>
                <SelectItem value="dataset">数据集</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
              <SelectTrigger className="w-30 h-9 rounded-xl border-border/60 text-[13px]">
                <SelectValue placeholder="状态筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">活跃</SelectItem>
                <SelectItem value="inactive">不完整</SelectItem>
                <SelectItem value="updating">更新中</SelectItem>
              </SelectContent>
            </Select>

            {/* Count */}
            <div className="ml-auto flex items-center gap-1.5 text-[13px] text-muted-foreground/60">
              <span className="font-mono font-medium tabular-nums text-foreground/80">
                {total.toLocaleString()}
              </span>
              个仓库
            </div>
          </div>
        </motion.div>
      </div>

      {/* 卡片列表 */}
      <div className="mb-2">
        <RepoGrid
          repos={repositories}
          isLoading={isLoading}
          error={error}
          onViewDetail={handleViewDetail}
        />
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            显示{" "}
            {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)}{" "}
            个，共 {total} 个仓库
          </p>
          <PaginatedNavigation
            currentPage={page + 1}
            totalPages={totalPages}
            onPageChange={(p) => setPage(p - 1)}
            className="mx-0 w-auto"
          />
        </div>
      )}
      {totalPages <= 1 && total > 0 && (
        <div className="mt-6">
          <p className="text-sm text-muted-foreground">
            显示 1-{total} 个，共 {total} 个仓库
          </p>
        </div>
      )}
    </div>
  );
}

export default Repositories;
