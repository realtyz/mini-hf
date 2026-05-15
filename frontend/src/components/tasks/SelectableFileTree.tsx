import { useState, useMemo } from "react";
import { Folder, File } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";
import type { PreviewItem } from "@/lib/api-types";
import {
  buildTree,
  getChildrenAtPath,
  getFilesInDirectory,
  getDirectorySelectionState,
  type TreeNode,
} from "@/lib/fileTreeUtils";

interface SelectableFileTreeProps {
  items: PreviewItem[];
  repoId: string;
  selectedPaths: Set<string>;
  onSelectionChange: (paths: Set<string>) => void;
}

export function SelectableFileTree({
  items,
  repoId,
  selectedPaths,
  onSelectionChange,
}: SelectableFileTreeProps) {
  const [currentPath, setCurrentPath] = useState<string>("");

  const repoName = repoId.split("/").pop() || repoId;

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

  const sortedChildren = useMemo(() => {
    return [...currentChildren].sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name);
      }
      return a.type === "directory" ? -1 : 1;
    });
  }, [currentChildren]);

  // Toggle a single file
  const toggleFile = (filePath: string) => {
    const next = new Set(selectedPaths);
    if (next.has(filePath)) {
      next.delete(filePath);
    } else {
      next.add(filePath);
    }
    onSelectionChange(next);
  };

  // Toggle a directory (select/deselect all files under it)
  const toggleDirectory = (dirPath: string) => {
    const files = getFilesInDirectory(dirPath, items);
    const state = getDirectorySelectionState(dirPath, selectedPaths, items);
    const next = new Set(selectedPaths);

    if (state === "all") {
      for (const f of files) next.delete(f);
    } else {
      for (const f of files) next.add(f);
    }
    onSelectionChange(next);
  };

  const selectAll = () => {
    const allFiles = new Set(
      items.filter((i) => i.type === "file").map((i) => i.path)
    );
    onSelectionChange(allFiles);
  };

  const deselectAll = () => {
    onSelectionChange(new Set());
  };

  // Stats for current view
  const currentStats = useMemo(() => {
    let files = 0;
    let dirs = 0;
    for (const child of sortedChildren) {
      if (child.type === "file") files++;
      else dirs++;
    }
    return { files, dirs };
  }, [sortedChildren]);

  return (
    <div className="border rounded-lg flex flex-col max-h-80 min-w-0 overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="bg-muted/20 px-3 py-1.5 border-b flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {selectedPaths.size} /{" "}
            {items.filter((i) => i.type === "file").length} 个文件已选
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={selectAll}
          >
            全选
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={deselectAll}
          >
            取消全选
          </Button>
        </div>
      </div>

      {/* Breadcrumb */}
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

      {/* File list */}
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
            sortedChildren.map((item, index) => {
              if (item.type === "directory") {
                const dirState = getDirectorySelectionState(
                  item.path,
                  selectedPaths,
                  items
                );
                const isIndeterminate = dirState === "some";

                return (
                  <div
                    key={item.path}
                    className="flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/30 transition-colors group min-w-0 overflow-hidden"
                    style={{ animationDelay: `${index * 20}ms` }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                      <Checkbox
                        checked={
                          dirState === "all"
                            ? true
                            : dirState === "some"
                              ? "indeterminate"
                              : false
                        }
                        onCheckedChange={() => toggleDirectory(item.path)}
                        className={isIndeterminate ? "data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground" : ""}
                      />
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
                    </div>
                  </div>
                );
              }

              // File row
              const isSelected = selectedPaths.has(item.path);
              const isCached = item.is_cached === true;
              return (
                <div
                  key={item.path}
                  className={`flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/30 transition-colors group min-w-0 overflow-hidden ${isCached ? "opacity-75" : ""}`}
                  style={{ animationDelay: `${index * 20}ms` }}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleFile(item.path)}
                    />
                    <div
                      className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? "bg-primary/10 dark:bg-primary/20 group-hover:bg-primary/20 dark:group-hover:bg-primary/30"
                          : "bg-muted/50 group-hover:bg-muted/80"
                      }`}
                    >
                      <File
                        className={`h-3.5 w-3.5 transition-colors ${
                          isSelected
                            ? "text-primary"
                            : "text-muted-foreground/40"
                        }`}
                      />
                    </div>
                    <span
                      className={`truncate font-mono text-xs transition-colors w-full min-w-0 ${
                        !isSelected ? "text-muted-foreground/50" : ""
                      }`}
                      title={item.name}
                    >
                      {item.name}
                    </span>
                    {isCached && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-5 px-1.5 shrink-0 bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                      >
                        已缓存
                      </Badge>
                    )}
                    {isSelected && !isCached && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-5 px-1.5 shrink-0 bg-primary/5 border-primary/30 text-primary hover:bg-primary/10 transition-colors"
                      >
                        Selected
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span
                      className={`text-xs text-right w-20 font-mono transition-colors ${
                        isSelected
                          ? "text-muted-foreground/80"
                          : "text-muted-foreground/40"
                      }`}
                    >
                      {formatBytes(item.size)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Bottom stats */}
      <div className="bg-muted/20 px-3 py-2 border-t flex justify-between shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Folder className="h-3 w-3 text-amber-500/70" />
          <span>{currentStats.dirs} 个目录</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <File className="h-3 w-3 text-primary/70" />
          <span>{currentStats.files} 个文件</span>
        </div>
      </div>
    </div>
  );
}

export default SelectableFileTree;
