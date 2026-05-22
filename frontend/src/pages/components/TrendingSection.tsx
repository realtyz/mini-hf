import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { formatCompactNumber } from "@/lib/utils";
import { STALE_TIMES } from "@/lib/query-client";
import type { TrendingRepo } from "@/lib/api-types";
import { motion } from "framer-motion";
import {
  Flame,
  Download,
  Heart,
  Box,
  Database,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router";

async function fetchTrending(): Promise<TrendingRepo[]> {
  const response = await api.get<{ code: number; data: TrendingRepo[] }>(
    "/trending",
  );
  return response.data;
}

function RepoTypeBadge({ type }: { type: string }) {
  const isModel = type === "model";
  const Icon = isModel ? Box : Database;
  return (
    <Badge
      variant="secondary"
      className="text-[11px] px-2 py-0 h-5 font-medium inline-flex items-center gap-1"
    >
      <Icon className="h-3 w-3" />
      {isModel ? "Model" : "Dataset"}
    </Badge>
  );
}

function TrendingCardSkeleton() {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 pt-5">
        <Skeleton className="h-5 w-3/4 mb-2" />
        <Skeleton className="h-4 w-1/3" />
      </CardHeader>
      <CardContent className="pt-0 mt-auto pb-5 space-y-2">
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </CardContent>
    </Card>
  );
}

function TrendingCard({ repo, index }: { repo: TrendingRepo; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04, ease: "easeOut" }}
    >
      <Card className="h-full flex flex-col group transition-all duration-200 hover:shadow-md hover:border-primary/25 hover:-translate-y-0.5">
        <CardHeader className="pb-3 pt-5">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm font-semibold leading-snug group-hover:text-primary transition-colors break-all">
                {repo.repo_id}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">{repo.author}</p>
            </div>
            <a
              href={`https://huggingface.co/${repo.repo_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-muted-foreground/30 hover:text-primary transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </CardHeader>
        <CardContent className="pt-0 mt-auto pb-5 space-y-3">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Download className="h-3.5 w-3.5" />
              {formatCompactNumber(repo.downloads)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3.5 w-3.5" />
              {formatCompactNumber(repo.likes)}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <RepoTypeBadge type={repo.repo_type} />
            {repo.pipeline_tag && (
              <Badge variant="info" className="text-[11px] px-2 py-0 h-5 font-medium">
                {repo.pipeline_tag}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function TrendingSection() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["trending"],
    queryFn: fetchTrending,
    staleTime: STALE_TIMES.static,
  });

  return (
    <section className="relative py-8 md:py-12">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-orange-500/10 border border-orange-500/20 mb-2.5">
              <Flame className="h-3.5 w-3.5 text-orange-500" />
              <span className="text-xs font-medium text-orange-600">
                Trending on HuggingFace
              </span>
            </div>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              热门仓库
            </h2>
          </div>
          <Link
            to="/repositories"
            className="hidden sm:inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            浏览本地缓存
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {error ? (
          <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-destructive/30 bg-destructive/5">
            <AlertCircle className="h-8 w-8 text-destructive/60 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">
              数据加载失败
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              请检查网络连接后重试
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="cursor-pointer"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              重试
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {isLoading
              ? Array.from({ length: 9 }).map((_, i) => (
                <TrendingCardSkeleton key={i} />
              ))
              : data?.map((repo, i) => (
                <TrendingCard key={repo.repo_id} repo={repo} index={i} />
              ))}
          </div>
        )}

        <div className="mt-6 text-center sm:hidden">
          <Link
            to="/repositories"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            查看全部仓库
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
