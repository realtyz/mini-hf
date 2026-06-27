import type { RepoProfile } from "@/lib/api/types";
import { RepoCard } from "./RepoCard";
import { RepoCardSkeleton } from "./RepoCardSkeleton";
import { EmptyState, ErrorState } from "@/components/shared";
import { FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface RepoGridProps {
  repos: RepoProfile[];
  isLoading: boolean;
  error: Error | null;
  onViewDetail: (repo: RepoProfile) => void;
  /** Retry handler for the error state. Omit to hide the retry button. */
  onRetry?: () => void;
  /** Number of card columns per row. Defaults to auto-fill. */
  columns?: 3 | 4;
}

function gridColsClass(columns?: 3 | 4): string {
  if (columns === 4)
    return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  if (columns === 3) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
  return "grid-cols-[repeat(auto-fill,minmax(260px,1fr))]";
}

export function RepoGrid({
  repos,
  isLoading,
  error,
  onViewDetail,
  onRetry,
  columns,
}: RepoGridProps) {
  if (isLoading) {
    return (
      <div className="@container">
        <div className={cn("grid gap-4", gridColsClass(columns))}>
          {Array.from({ length: 8 }).map((_, i) => (
            <RepoCardSkeleton key={i} index={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        message="加载失败"
        description="请检查网络连接后重试"
        onRetry={onRetry}
      />
    );
  }

  if (repos.length === 0) {
    return (
      <EmptyState
        icon={<FolderOpen className="size-7 text-muted-foreground/50" />}
        message="暂无仓库数据"
        description="尝试调整筛选条件或创建新的下载任务"
      />
    );
  }

  return (
    <div className="@container">
      <div className={cn("grid gap-4", gridColsClass(columns))}>
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
