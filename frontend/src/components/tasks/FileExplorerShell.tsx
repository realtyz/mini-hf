import { useState, useMemo, type ReactNode } from "react";
import { Folder, File } from "lucide-react";
import type { PreviewItem } from "@/lib/api/types";
import {
  buildTree,
  getChildrenAtPath,
  sortTreeChildren,
  type TreeNode,
} from "@/lib/file-tree-utils";

interface FileExplorerShellProps {
  items: PreviewItem[];
  repoId: string;
  /** Render a single row. `navigate` enters a directory path. */
  renderRow: (
    item: TreeNode,
    index: number,
    navigate: (path: string) => void,
  ) => ReactNode;
  /** Optional toolbar rendered above the breadcrumb (e.g. select-all bar). */
  toolbar?: ReactNode;
  className?: string;
}

/**
 * Shared shell for the preview/selectable file trees: owns current-path state,
 * breadcrumb, sort order, empty state, and footer stats. Callers only provide
 * a row renderer (and optional toolbar).
 */
export function FileExplorerShell({
  items,
  repoId,
  renderRow,
  toolbar,
  className,
}: FileExplorerShellProps) {
  const [currentPath, setCurrentPath] = useState<string>("");

  // 从 repoId 中提取 repo_name（最后一个 / 后的部分）
  const repoName = repoId.split("/").pop() || repoId;

  const tree = useMemo(() => buildTree(items), [items]);

  const currentChildren = useMemo(() => {
    const children = getChildrenAtPath(tree, currentPath);
    return children ? Array.from(children.values()) : [];
  }, [tree, currentPath]);

  const sortedChildren = useMemo(
    () => sortTreeChildren(currentChildren),
    [currentChildren],
  );

  const breadcrumbParts = useMemo(() => {
    if (!currentPath) return [];
    return currentPath.split("/");
  }, [currentPath]);

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      setCurrentPath("");
    } else {
      setCurrentPath(breadcrumbParts.slice(0, index + 1).join("/"));
    }
  };

  const dirCount = sortedChildren.filter((i) => i.type === "directory").length;
  const fileCount = sortedChildren.filter((i) => i.type === "file").length;

  return (
    <div
      className={
        className ??
        "border rounded-lg flex flex-col max-h-80 min-w-0 overflow-hidden bg-background"
      }
    >
      {/* Toolbar（可选） */}
      {toolbar}

      {/* 面包屑导航 */}
      <div className="bg-muted/30 px-3 py-2 border-b flex items-center gap-0.5 text-sm flex-wrap shrink-0">
        <button
          className="h-6 px-1.5 font-medium flex items-center cursor-pointer rounded hover:bg-muted/80 transition-colors group"
          onClick={() => handleBreadcrumbClick(-1)}
        >
          <Folder className="h-3.5 w-3.5 mr-1 text-amber-500 dark:text-amber-400 group-hover:text-amber-600 dark:group-hover:text-amber-300 transition-colors" />
          <span>{repoName}</span>
        </button>

        {breadcrumbParts.map((part, index) => (
          <div key={index} className="flex items-center">
            <span className="text-muted-foreground/50 mx-0.5">/</span>
            <button
              className="h-6 px-1.5 font-normal cursor-pointer rounded hover:bg-muted/80 transition-colors"
              onClick={() => handleBreadcrumbClick(index)}
            >
              {part}
            </button>
          </div>
        ))}
      </div>

      {/* 文件列表 */}
      <div className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto">
        <div className="divide-y divide-border/50 min-w-0">
          {sortedChildren.length === 0 ? (
            <div className="py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted/50 mb-3">
                <Folder className="h-5 w-5 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground">此目录为空</p>
            </div>
          ) : (
            sortedChildren.map((item, index) =>
              renderRow(item, index, handleNavigate),
            )
          )}
        </div>
      </div>

      {/* 底部统计 */}
      <div className="bg-muted/20 px-3 py-2 border-t flex justify-between shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Folder className="h-3 w-3 text-amber-500/70" />
          <span>{dirCount} 个目录</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <File className="h-3 w-3 text-primary/70" />
          <span>{fileCount} 个文件</span>
        </div>
      </div>
    </div>
  );
}

export default FileExplorerShell;
