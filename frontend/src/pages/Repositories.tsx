import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
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
import api from "@/lib/api";
import type {
  RepoProfile,
  RepoListResponse,
  RepoListParams,
} from "@/lib/api-types";
import { RepoGrid, RepoPagination } from "@/components/repo";

const PAGE_SIZE = 16;

type RepoTypeFilter = "all" | "model" | "dataset";
type ModelSource = "huggingface" | "modelscope";

interface FetchReposParams extends RepoListParams {
  repoType: RepoTypeFilter;
  modelSource: ModelSource;
}

async function fetchRepositories({
  repoType,
  modelSource,
  ...params
}: FetchReposParams): Promise<RepoListResponse> {
  const queryParams: Record<string, unknown> = { ...params };

  if (repoType !== "all") {
    queryParams.repo_type = repoType;
  }

  const endpoint =
    modelSource === "huggingface" ? "/hf_repo/list-public" : "/ms_repo/list";
  return api.get<RepoListResponse>(endpoint, { params: queryParams });
}

export function Repositories() {
  const navigate = useNavigate();
  const [repoType, setRepoType] = useState<RepoTypeFilter>("all");
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
      { modelSource, repoType, search: debouncedSearch, page },
    ],
    queryFn: () =>
      fetchRepositories({
        modelSource,
        repoType,
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
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-50 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="搜索仓库名称..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select value={repoType} onValueChange={handleRepoTypeChange}>
            <SelectTrigger className="w-30">
              <SelectValue placeholder="类型筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              <SelectItem value="model">模型</SelectItem>
              <SelectItem value="dataset">数据集</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
      <RepoPagination
        page={page}
        total={total}
        totalPages={totalPages}
        isLoading={isLoading}
        onPageChange={setPage}
      />
    </div>
  );
}

export default Repositories;
