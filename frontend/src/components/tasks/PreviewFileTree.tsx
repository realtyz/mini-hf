import { useState, useMemo } from "react";
import { Folder, File } from "lucide-react";
import { Badge } from "@/components/ui/badge";
// import { ScrollArea } from "@/components/ui/scroll-area";
import { formatBytes } from "@/lib/utils";
import type { PreviewItem } from "@/lib/api-types";

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  required: boolean;
  children?: Map<string, TreeNode>;
}

interface PreviewFileTreeProps {
  items: PreviewItem[];
  repoId: string;
}

function buildTree(items: PreviewItem[]): Map<string, TreeNode> {
  const root = new Map<string, TreeNode>();

  for (const item of items) {
    const parts = item.path.split("/");
    let current = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      currentPath = currentPath ? `${currentPath}/${name}` : name;

      if (i === parts.length - 1) {
        // 叶子节点（文件或空目录）
        current.set(name, {
          name,
          path: item.path,
          type: item.type,
          size: item.size,
          required: item.required,
        });
      } else {
        // 目录节点
        if (!current.has(name)) {
          current.set(name, {
            name,
            path: currentPath,
            type: "directory",
            size: 0,
            required: false,
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
  path: string
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

export function PreviewFileTree({ items, repoId }: PreviewFileTreeProps) {
  const [currentPath, setCurrentPath] = useState<string>("");

  // 从 repoId 中提取 repo_name（最后一个 / 后的部分）
  const repoName = repoId.split('/').pop() || repoId;

  const tree = useMemo(() => buildTree(items), [items]);

  const currentChildren = useMemo(() => {
    const children = getChildrenAtPath(tree, currentPath);
    return children ? Array.from(children.values()) : [];
  }, [tree, currentPath]);

  const breadcrumbParts = useMemo(() => {
    if (!currentPath) return [];
    return currentPath.split("/");
  }, [currentPath]);

  const handleEnterDirectory = (dirPath: string) => {
    setCurrentPath(dirPath);
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      setCurrentPath("");
    } else {
      const newPath = breadcrumbParts.slice(0, index + 1).join("/");
      setCurrentPath(newPath);
    }
  };

  // 按类型排序：目录在前，文件在后，各自按名称排序
  const sortedChildren = useMemo(() => {
    return [...currentChildren].sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name);
      }
      return a.type === "directory" ? -1 : 1;
    });
  }, [currentChildren]);

  return (
    <div className="border rounded-lg flex flex-col max-h-80 min-w-0 overflow-hidden bg-background">
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
            sortedChildren.map((item, index) => (
              <div
                key={item.path}
                className="flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/30 transition-colors group min-w-0 overflow-hidden"
                style={{
                  animationDelay: `${index * 20}ms`
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                  {item.type === "directory" ? (
                    <>
                      <div className="w-7 h-7 rounded-md bg-amber-500/10 dark:bg-amber-500/20 flex items-center justify-center shrink-0 group-hover:bg-amber-500/20 dark:group-hover:bg-amber-500/30 transition-colors">
                        <Folder className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <button
                        onClick={() => handleEnterDirectory(item.path)}
                        className="truncate font-mono text-xs text-left cursor-pointer hover:text-primary transition-colors group-hover:underline w-full min-w-0"
                        title={item.name}
                      >
                        {item.name}
                      </button>
                    </>
                  ) : (
                    <>
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                        item.required
                          ? "bg-primary/10 dark:bg-primary/20 group-hover:bg-primary/20 dark:group-hover:bg-primary/30"
                          : "bg-muted/50 group-hover:bg-muted/80"
                      }`}>
                        <File className={`h-3.5 w-3.5 transition-colors ${
                          item.required
                            ? "text-primary"
                            : "text-muted-foreground/40"
                        }`} />
                      </div>
                      <span
                        className={`truncate font-mono text-xs transition-colors w-full min-w-0 ${
                          !item.required ? "text-muted-foreground/50" : ""
                        }`}
                        title={item.name}
                      >
                        {item.name}
                      </span>
                    </>
                  )}
                  {item.type === "file" && item.required && (
                    <Badge
                      variant="outline"
                      className="text-[10px] h-5 px-1.5 shrink-0 bg-primary/5 border-primary/30 text-primary hover:bg-primary/10 transition-colors"
                    >
                      Required
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {item.type === "file" && (
                    <span
                      className={`text-xs text-right w-20 font-mono transition-colors ${
                        item.required
                          ? "text-muted-foreground/80"
                          : "text-muted-foreground/40"
                      }`}
                    >
                      {formatBytes(item.size)}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 底部统计 */}
      <div className="bg-muted/20 px-3 py-2 border-t flex justify-between shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Folder className="h-3 w-3 text-amber-500/70" />
          <span>{sortedChildren.filter((i) => i.type === "directory").length} 个目录</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <File className="h-3 w-3 text-primary/70" />
          <span>{sortedChildren.filter((i) => i.type === "file").length} 个文件</span>
        </div>
      </div>
    </div>
  );
}

export default PreviewFileTree;
