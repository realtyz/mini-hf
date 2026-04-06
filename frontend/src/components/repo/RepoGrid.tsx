import type { RepoProfile } from "@/lib/api-types";
import { RepoCard } from "./RepoCard";
import { RepoCardSkeleton } from "./RepoCardSkeleton";
import { SearchX, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RepoGridProps {
  repos: RepoProfile[];
  isLoading: boolean;
  error: Error | null;
  onViewDetail: (repo: RepoProfile) => void;
}

export function RepoGrid({
  repos,
  isLoading,
  error,
  onViewDetail,
}: RepoGridProps) {
  if (isLoading) {
    return (
      <div className="@container">
        <div className="grid grid-cols-1 @[500px]:grid-cols-2 @[750px]:grid-cols-3 @[1000px]:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <RepoCardSkeleton key={i} index={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-destructive/30 bg-destructive/5">
        <div className="text-center px-6">
          <div className="mx-auto size-14 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <SearchX className="size-7 text-destructive/60" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">加载失败</p>
          <p className="text-xs text-muted-foreground mb-4">
            请检查网络连接后重试
          </p>
          <Button variant="outline" size="sm" className="text-xs">
            重试
          </Button>
        </div>
      </div>
    );
  }

  if (repos.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/20">
        <div className="text-center px-6">
          <div className="mx-auto size-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <FolderOpen className="size-7 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">
            暂无仓库数据
          </p>
          <p className="text-xs text-muted-foreground/80">
            尝试调整筛选条件或创建新的下载任务
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="@container">
      <div className="grid grid-cols-1 @[500px]:grid-cols-2 @[750px]:grid-cols-3 @[1000px]:grid-cols-4 gap-4">
        {repos.map((repo, index) => (
          <RepoCard
            key={repo.id}
            repo={repo}
            index={index}
            onViewDetail={() => onViewDetail(repo)}
          />
        ))}
      </div>
    </div>
  );
}
