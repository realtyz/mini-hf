import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  File,
  Folder,
  CheckCircle2,
  Circle,
  Loader2,
  Download,
  ArrowUp,
  SearchX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import type { RepoTreeResponse, RepoTreeItem } from "@/lib/api-types";
import { cn } from "@/lib/utils";

interface RepoTreeViewerProps {
  repoId: string;
  repoType: string;
  commitHash: string;
}

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  is_cached: boolean | null;
  children?: Map<string, TreeNode>;
}

function buildTree(items: RepoTreeItem[]): Map<string, TreeNode> {
  const root = new Map<string, TreeNode>();

  for (const item of items) {
    const parts = item.path.split("/");
    let current = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      currentPath = currentPath ? `${currentPath}/${name}` : name;

      if (i === parts.length - 1) {
        current.set(name, {
          name,
          path: item.path,
          type: item.type,
          size: item.size,
          is_cached: item.is_cached,
        });
      } else {
        if (!current.has(name)) {
          current.set(name, {
            name,
            path: currentPath,
            type: "directory",
            size: 0,
            is_cached: null,
            children: new Map<string, TreeNode>(),
          });
        }
        const node = current.get(name)!;
        if (!node.children) {
          node.children = new Map<string, TreeNode>();
        }
        current = node.children;
      }
    }
  }

  return root;
}

function getChildrenAtPath(
  root: Map<string, TreeNode>,
  path: string,
): Map<string, TreeNode> | null {
  if (!path) return root;

  const parts = path.split("/");
  let current = root;

  for (const part of parts) {
    const node = current.get(part);
    if (!node || node.type !== "directory" || !node.children) {
      return null;
    }
    current = node.children;
  }

  return current;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "-";
  if (bytes >= 1024 * 1024 * 1024)
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}

async function fetchRepoTree(
  repoId: string,
  commitHash: string,
): Promise<RepoTreeResponse> {
  const endpoint = `/hf_repo/${encodeURIComponent(repoId)}/tree/${encodeURIComponent(commitHash)}`;
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

  const sortedChildren = useMemo(() => {
    return [...currentChildren].sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === "directory" ? -1 : 1;
    });
  }, [currentChildren]);

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
      <div className="py-3 space-y-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 flex flex-col items-center justify-center">
        <div className="size-10 rounded-full bg-destructive/10 flex items-center justify-center mb-3">
          <SearchX className="size-5 text-destructive/60" />
        </div>
        <p className="text-sm text-muted-foreground mb-2">加载失败</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="text-xs h-7"
        >
          重试
        </Button>
      </div>
    );
  }

  if (allItems.length === 0) {
    return (
      <div className="py-8 flex flex-col items-center justify-center">
        <div className="size-10 rounded-full bg-muted flex items-center justify-center mb-3">
          <File className="size-5 text-muted-foreground/50" />
        </div>
        <p className="text-sm text-muted-foreground">暂无文件</p>
      </div>
    );
  }

  return (
    <div className="border rounded-xl flex flex-col min-h-50 max-h-120 overflow-hidden bg-muted/20">
      {/* 面包屑导航 */}
      <div className="bg-muted/60 px-3 py-2 border-b border-border/50 flex items-center gap-1 text-sm flex-wrap shrink-0">
        <button
          className="h-6 px-2 font-medium flex items-center cursor-pointer select-none rounded-md hover:bg-background/80 active:bg-background transition-colors text-foreground/80 group"
          onClick={() => handleBreadcrumbClick(-1)}
        >
          <Folder className="h-3.5 w-3.5 mr-1.5 text-amber-500 group-hover:scale-110 transition-transform" />
          {repoName}
        </button>
        {breadcrumbParts.map((part, index) => {
          const isLast = index === breadcrumbParts.length - 1;
          return (
            <div key={index} className="flex items-center">
              <span className="text-muted-foreground/30 mx-0.5">/</span>
              {isLast ? (
                <span className="h-6 px-2 font-medium rounded-md bg-background/60 text-foreground/90 text-[13px]">
                  {part}
                </span>
              ) : (
                <button
                  className="h-6 px-2 font-normal cursor-pointer rounded-md hover:bg-background/60 active:bg-background/80 transition-colors text-foreground/50 hover:text-foreground text-[13px]"
                  onClick={() => handleBreadcrumbClick(index)}
                >
                  {part}
                </button>
              )}
            </div>
          );
        })}
        {isLoading && (
          <Loader2 className="h-3.5 w-3.5 ml-2 animate-spin text-muted-foreground" />
        )}

        {/* 返回上级按钮 */}
        {currentPath && (
          <button
            onClick={() => handleBreadcrumbClick(breadcrumbParts.length - 2)}
            className="ml-auto h-6 px-2 text-[11px] font-medium flex items-center gap-1 text-muted-foreground hover:text-foreground cursor-pointer select-none rounded-md hover:bg-background/60 transition-colors"
          >
            <ArrowUp className="h-3 w-3" />
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
        <div className="divide-y divide-border/30">
          {sortedChildren.length === 0 ? (
            <div className="py-10 flex flex-col items-center justify-center text-muted-foreground">
              <Folder className="size-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm">此目录为空</p>
            </div>
          ) : (
            sortedChildren.map((item, index) => (
              <div
                key={item.path}
                data-file-item
                className={cn(
                  "flex items-center justify-between px-3 py-2 text-sm select-none transition-colors",
                  item.type === "directory"
                    ? "cursor-pointer hover:bg-muted/60 active:bg-muted"
                    : "hover:bg-muted/40",
                  selectedIndex === index &&
                  "bg-primary/5 ring-1 ring-inset ring-primary/20",
                )}
                onClick={
                  item.type === "directory"
                    ? () => handleNavigate(item.path)
                    : undefined
                }
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {item.type === "directory" ? (
                    <>
                      <div className="size-6 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0">
                        <Folder className="h-3.5 w-3.5 text-amber-500" />
                      </div>
                      <span
                        className="truncate font-mono text-xs text-foreground/80 group-hover:text-foreground"
                        title={item.name}
                      >
                        {item.name}
                      </span>
                    </>
                  ) : (
                    <>
                      <div
                        className={cn(
                          "size-6 rounded-md flex items-center justify-center shrink-0",
                          item.is_cached ? "bg-emerald-500/10" : "bg-muted/50",
                        )}
                      >
                        <File
                          className={cn(
                            "h-3.5 w-3.5",
                            item.is_cached
                              ? "text-emerald-500"
                              : "text-muted-foreground/40",
                          )}
                        />
                      </div>
                      <span
                        className={cn(
                          "truncate font-mono text-xs",
                          item.is_cached
                            ? "text-foreground/80"
                            : "text-muted-foreground/50",
                        )}
                        title={item.name}
                      >
                        {item.name}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {item.type === "file" && (
                    <span
                      className={cn(
                        "text-[11px] text-right w-16 tabular-nums",
                        item.is_cached
                          ? "text-muted-foreground"
                          : "text-muted-foreground/40",
                      )}
                    >
                      {formatSize(item.size)}
                    </span>
                  )}
                  {item.type === "file" &&
                    (item.is_cached ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-muted-foreground/20 shrink-0" />
                    ))}
                  {item.type === "file" &&
                    (item.is_cached ? (
                      <a
                        href={`${import.meta.env.VITE_API_BASE_URL}/hf_repo/${encodeURIComponent(repoId)}/file?commit_hash=${encodeURIComponent(commitHash)}&path=${encodeURIComponent(item.path)}`}
                        download={item.name}
                        title="下载文件"
                        onClick={(e) => e.stopPropagation()}
                        className="size-7 flex items-center justify-center rounded-md hover:bg-muted active:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        title="文件未缓存，无法下载"
                        className="size-7 flex items-center justify-center rounded-md text-muted-foreground/20 cursor-not-allowed"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 底部统计 */}
      <div className="bg-muted/40 px-3 py-2 border-t border-border/50 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="size-5 rounded bg-amber-500/10 flex items-center justify-center">
              <Folder className="h-3 w-3 text-amber-500/70" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
              {sortedChildren.filter((i) => i.type === "directory").length}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="size-5 rounded bg-muted flex items-center justify-center">
              <File className="h-3 w-3 text-muted-foreground/60" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
              {sortedChildren.filter((i) => i.type === "file").length}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3 text-emerald-500/70" />
          <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
            {
              sortedChildren.filter((i) => i.type === "file" && i.is_cached)
                .length
            }
          </span>
          <span className="text-[11px] text-muted-foreground/60">已缓存</span>
        </div>
      </div>
    </div>
  );
}
