import { useMemo } from "react";
import { Folder, File } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";
import type { PreviewItem } from "@/lib/api/types";
import {
  getFilesInDirectory,
  getDirectorySelectionState,
  type TreeNode,
} from "@/lib/file-tree-utils";
import { FileExplorerShell } from "./FileExplorerShell";

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
  // 已缓存文件路径集合 — 这些文件始终视为选中且不可变更
  const cachedPaths = useMemo(
    () =>
      new Set(
        items
          .filter((i) => i.type === "file" && i.is_cached === true)
          .map((i) => i.path),
      ),
    [items],
  );

  // 非缓存文件数量（全局）
  const nonCachedFileCount = useMemo(
    () => items.filter((i) => i.type === "file" && i.is_cached !== true).length,
    [items],
  );

  // 有效选中 = 用户选择 + 已缓存文件（始终选中）
  const effectiveSelected = useMemo(
    () => new Set([...selectedPaths, ...cachedPaths]),
    [selectedPaths, cachedPaths],
  );

  // Toggle a single file — 已缓存文件不可操作
  const toggleFile = (filePath: string) => {
    if (cachedPaths.has(filePath)) return;
    const next = new Set(selectedPaths);
    if (next.has(filePath)) {
      next.delete(filePath);
    } else {
      next.add(filePath);
    }
    onSelectionChange(next);
  };

  // Toggle a directory — 仅切换非缓存文件
  const toggleDirectory = (dirPath: string) => {
    const allFiles = getFilesInDirectory(dirPath, items);
    const nonCachedFiles = allFiles.filter((f) => !cachedPaths.has(f));
    const state = getDirectorySelectionState(dirPath, effectiveSelected, items);
    const next = new Set(selectedPaths);

    if (state === "all") {
      for (const f of nonCachedFiles) next.delete(f);
    } else {
      for (const f of nonCachedFiles) next.add(f);
    }
    onSelectionChange(next);
  };

  // 全选 / 取消全选 — 仅影响非缓存文件
  const selectAll = () => {
    const nonCachedFiles = items
      .filter((i) => i.type === "file" && i.is_cached !== true)
      .map((i) => i.path);
    onSelectionChange(new Set(nonCachedFiles));
  };

  const deselectAll = () => {
    onSelectionChange(new Set());
  };

  const toolbar = (
    <div className="bg-muted/20 px-3 py-1.5 border-b flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          {selectedPaths.size} / {nonCachedFileCount} 个文件已选
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
  );

  const renderRow = (
    item: TreeNode,
    index: number,
    navigate: (path: string) => void,
  ) => {
    if (item.type === "directory") {
      const dirState = getDirectorySelectionState(
        item.path,
        effectiveSelected,
        items,
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
              className={
                isIndeterminate
                  ? "data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground"
                  : ""
              }
            />
            <div className="w-7 h-7 rounded-md bg-amber-500/10 dark:bg-amber-500/20 flex items-center justify-center shrink-0 group-hover:bg-amber-500/20 dark:group-hover:bg-amber-500/30 transition-colors">
              <Folder className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </div>
            <button
              onClick={() => navigate(item.path)}
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
    const isEffectivelySelected = isCached || isSelected;
    return (
      <div
        key={item.path}
        className={`flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/30 transition-colors group min-w-0 overflow-hidden ${isCached ? "opacity-60" : ""}`}
        style={{ animationDelay: `${index * 20}ms` }}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
          <Checkbox
            checked={isEffectivelySelected}
            disabled={isCached}
            onCheckedChange={() => toggleFile(item.path)}
          />
          <div
            className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors ${
              isSelected
                ? "bg-primary/10 dark:bg-primary/20 group-hover:bg-primary/20 dark:group-hover:bg-primary/30"
                : isCached
                  ? "bg-emerald-500/10 dark:bg-emerald-500/20"
                  : "bg-muted/50 group-hover:bg-muted/80"
            }`}
          >
            <File
              className={`h-3.5 w-3.5 transition-colors ${
                isSelected
                  ? "text-primary"
                  : isCached
                    ? "text-emerald-500/60"
                    : "text-muted-foreground/40"
              }`}
            />
          </div>
          <span
            className={`truncate font-mono text-xs transition-colors w-full min-w-0 ${
              isCached
                ? "text-muted-foreground/50"
                : !isSelected
                  ? "text-muted-foreground/50"
                  : ""
            }`}
            title={item.name}
          >
            {item.name}
          </span>
          {isCached && (
            <Badge
              variant="outline"
              className="text-[10px] h-5 px-1.5 shrink-0 bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
            >
              已缓存
            </Badge>
          )}
          {isSelected && !isCached && (
            <Badge
              variant="outline"
              className="text-[10px] h-5 px-1.5 shrink-0 bg-primary/5 border-primary/30 text-primary"
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
  };

  return (
    <FileExplorerShell
      items={items}
      repoId={repoId}
      renderRow={renderRow}
      toolbar={toolbar}
    />
  );
}