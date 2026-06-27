import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  File,
  Folder,
  Loader2,
  Download,
  ArrowUp,
  SearchX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api/client";
import { config } from "@/lib/runtime-config";
import endpoints from "@/lib/api/endpoints";
import type { RepoTreeResponse, RepoTreeItem } from "@/lib/api/types";
import { cn, formatBytes } from "@/lib/utils";

interface RepoTreeViewerProps {
  repoId: string;
  commitHash: string;
}

import { buildTree, getChildrenAtPath, sortTreeChildren } from "@/lib/file-tree-utils";

async function fetchRepoTree(
  repoId: string,
  commitHash: string,
): Promise<RepoTreeResponse> {
  const endpoint = endpoints.repo.tree(repoId, commitHash);
  return api.get<RepoTreeResponse>(endpoint);
}

export function RepoTreeViewer({ repoId, commitHash }: RepoTreeViewerProps) {
  const [currentPath, setCurrentPath] = useState("");
  const [isNavigating, setIsNavigating] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  const repoName = repoId.split("/").pop() || repoId;

  const { data, isLoading, error, refetch } = useQuery<RepoTreeResponse>({
    queryKey: ["repo-tree", repoId, commitHash],
    queryFn: () => fetchRepoTree(repoId, commitHash),
  });

  const allItems = useMemo<RepoTreeItem[]>(() => data?.data ?? [], [data]);

  const tree = useMemo(() => buildTree(allItems), [allItems]);

  const currentChildren = useMemo(() => {
    const children = getChildrenAtPath(tree, currentPath);
    return children ? Array.from(children.values()) : [];
  }, [tree, currentPath]);

  const sortedChildren = useMemo(
    () => sortTreeChildren(currentChildren),
    [currentChildren],
  );

  const repoFileStats = useMemo(() => {
    const files = allItems.filter((i) => i.type === "file");
    const cached = files.filter((i) => i.is_cached).length;
    return { total: files.length, cached };
  }, [allItems]);

  const breadcrumbParts = useMemo(() => {
    if (!currentPath) return [];
    return currentPath.split("/");
  }, [currentPath]);

  // 切换目录时添加动画
  const handleNavigate = useCallback((path: string) => {
    setIsNavigating(true);
    setSelectedIndex(-1);
    setTimeout(() => {
      setCurrentPath(path);
      setTimeout(() => setIsNavigating(false), 50);
    }, 100);
  }, []);

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      handleNavigate("");
    } else {
      handleNavigate(breadcrumbParts.slice(0, index + 1).join("/"));
    }
  };

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (sortedChildren.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < sortedChildren.length - 1 ? prev + 1 : prev,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case "Enter":
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < sortedChildren.length) {
            const item = sortedChildren[selectedIndex];
            if (item.type === "directory") {
              handleNavigate(item.path);
            }
          }
          break;
        case "Backspace":
          e.preventDefault();
          if (currentPath) {
            const parentPath = breadcrumbParts.slice(0, -1).join("/");
            handleNavigate(parentPath);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    sortedChildren,
    selectedIndex,
    currentPath,
    breadcrumbParts,
    handleNavigate,
  ]);

  // 滚动选中项到视野
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll("[data-file-item]");
      const selectedItem = items[selectedIndex] as HTMLElement;
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedIndex]);

  if (isLoading) {
    return (
      <div className="border border-border/60 rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-border/40 h-9" />
        <div className="divide-y divide-border/20">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-3 py-2 flex items-center gap-3">
              <Skeleton className="size-3.5 rounded-sm shrink-0" />
              <Skeleton className="h-3 flex-1 max-w-[40%]" />
              <Skeleton className="h-3 w-12 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-border/60 rounded-lg py-10 flex flex-col items-center justify-center">
        <SearchX
          className="size-4 text-muted-foreground/60 mb-2"
          strokeWidth={1.5}
        />
        <p className="text-xs font-mono text-muted-foreground mb-3">加载失败</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="text-[11px] font-mono h-7 px-3 text-muted-foreground hover:text-foreground"
        >
          重试
        </Button>
      </div>
    );
  }

  if (allItems.length === 0) {
    return (
      <div className="border border-border/60 rounded-lg py-10 flex flex-col items-center justify-center">
        <File
          className="size-4 text-muted-foreground/40 mb-2"
          strokeWidth={1.5}
        />
        <p className="text-xs font-mono text-muted-foreground">暂无文件</p>
      </div>
    );
  }

  const dirCount = sortedChildren.filter((i) => i.type === "directory").length;
  const fileCount = sortedChildren.filter((i) => i.type === "file").length;

  return (
    <div className="border border-border/60 rounded-lg flex flex-col min-h-50 max-h-120 overflow-hidden bg-card">
      {/* 面包屑 — 纯 mono 路径，无 pill 背景 */}
      <div className="px-3 py-2 border-b border-border/40 flex items-center gap-0.5 text-xs font-mono flex-wrap shrink-0 leading-none">
        <button
          className="px-1 py-1 inline-flex items-center gap-1.5 cursor-pointer select-none text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => handleBreadcrumbClick(-1)}
        >
          <Folder className="h-3 w-3 text-amber-500" strokeWidth={1.5} />
          <span>{repoName}</span>
        </button>
        {breadcrumbParts.map((part, index) => {
          const isLast = index === breadcrumbParts.length - 1;
          return (
            <div key={index} className="flex items-center">
              <span className="text-border mx-0.5 select-none">/</span>
              {isLast ? (
                <span className="px-1 py-1 text-foreground">{part}</span>
              ) : (
                <button
                  className="px-1 py-1 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => handleBreadcrumbClick(index)}
                >
                  {part}
                </button>
              )}
            </div>
          );
        })}
        {isLoading && (
          <Loader2 className="h-3 w-3 ml-2 animate-spin text-muted-foreground/60" />
        )}

        {currentPath && (
          <button
            onClick={() => handleBreadcrumbClick(breadcrumbParts.length - 2)}
            className="ml-auto px-1.5 py-1 text-[10px] inline-flex items-center gap-1 text-muted-foreground/70 hover:text-foreground cursor-pointer select-none uppercase tracking-wider transition-colors"
          >
            <ArrowUp className="h-2.5 w-2.5" strokeWidth={2} />
            上级
          </button>
        )}
      </div>

      {/* 文件列表 */}
      <div
        className={cn(
          "flex-1 min-h-0 overflow-auto transition-opacity duration-150",
          isNavigating ? "opacity-30" : "opacity-100",
        )}
      >
        {sortedChildren.length === 0 ? (
          <div className="h-full min-h-32 flex flex-col items-center justify-center text-muted-foreground">
            <Folder
              className="size-4 text-muted-foreground/30 mb-2"
              strokeWidth={1.5}
            />
            <p className="text-xs font-mono">此目录为空</p>
          </div>
        ) : (
          sortedChildren.map((item, index) => {
            const isSelected = selectedIndex === index;
            const isDir = item.type === "directory";
            return (
              <div
                key={item.path}
                data-file-item
                className={cn(
                  "group relative flex items-center px-3 h-8 text-xs font-mono select-none transition-colors",
                  isDir ? "cursor-pointer" : "",
                  "hover:bg-muted/40",
                  isSelected && "bg-muted/60",
                )}
                onClick={isDir ? () => handleNavigate(item.path) : undefined}
              >
                {/* 选中指示：左侧实线 marker，替代整行底色 */}
                {isSelected && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1 bottom-1 w-0.5 bg-foreground/80 rounded-r-full"
                  />
                )}

                {/* 状态点 — signature element：文件/目录、缓存与否，由这一个点表达 */}
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full mr-3 shrink-0 transition-colors",
                    isDir
                      ? "bg-amber-500/70"
                      : item.is_cached
                        ? "bg-emerald-500"
                        : "bg-muted-foreground/20",
                  )}
                />

                {/* 图标 + 名称 */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {isDir ? (
                    <Folder
                      className="h-3.5 w-3.5 text-amber-500/90 shrink-0"
                      strokeWidth={1.5}
                    />
                  ) : (
                    <File
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        item.is_cached
                          ? "text-foreground/60"
                          : "text-muted-foreground/30",
                      )}
                      strokeWidth={1.5}
                    />
                  )}
                  <span
                    className={cn(
                      "truncate",
                      isDir
                        ? "text-foreground/90"
                        : item.is_cached
                          ? "text-foreground/85"
                          : "text-muted-foreground/55",
                    )}
                    title={item.name}
                  >
                    {item.name}
                  </span>
                </div>

                {/* 右侧：尺寸 + 下载（hover 显现） */}
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  {item.type === "file" && (
                    <span
                      className={cn(
                        "text-[10px] text-right w-14 tabular-nums tracking-tight",
                        item.is_cached
                          ? "text-muted-foreground"
                          : "text-muted-foreground/35",
                      )}
                    >
                      {item.size === 0 ? "—" : formatBytes(item.size)}
                    </span>
                  )}
                  {item.type === "file" && item.is_cached && (
                    <a
                      href={`${config.API_BASE_URL}${endpoints.repo.fileUrl(repoId, commitHash, item.path)}`}
                      download={item.name}
                      title="下载文件"
                      onClick={(e) => e.stopPropagation()}
                      className="size-6 flex items-center justify-center rounded-sm text-muted-foreground/50 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground hover:bg-muted active:bg-muted/80 transition-all"
                    >
                      <Download className="h-3 w-3" strokeWidth={1.75} />
                    </a>
                  )}
                  {/* 未缓存文件不占下载位 — 用一个等宽 spacer 维持列对齐 */}
                  {item.type === "file" && !item.is_cached && (
                    <span aria-hidden className="size-6 shrink-0" />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 底部：单行 mono stats，无色块、无图标 */}
      <div className="px-3 py-1.5 border-t border-border/40 flex items-center justify-between shrink-0 select-none text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
        <span className="tabular-nums">
          {dirCount} 目录 · {fileCount} 文件
        </span>
        <span className="tabular-nums">
          <span className="text-foreground/80 normal-case">
            {repoFileStats.cached}
          </span>
          <span className="opacity-60"> / {repoFileStats.total} 已缓存</span>
        </span>
      </div>
    </div>
  );
}
