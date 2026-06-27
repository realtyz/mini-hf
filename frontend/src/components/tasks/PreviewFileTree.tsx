import { Folder, File } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatBytes } from "@/lib/utils";
import type { PreviewItem } from "@/lib/api/types";
import type { TreeNode } from "@/lib/file-tree-utils";
import { FileExplorerShell } from "./FileExplorerShell";

interface PreviewFileTreeProps {
  items: PreviewItem[];
  repoId: string;
}

export function PreviewFileTree({ items, repoId }: PreviewFileTreeProps) {
  const allRequired = items.every((i) => i.type !== "file" || i.required);

  const renderRow = (
    item: TreeNode,
    index: number,
    navigate: (path: string) => void,
  ) => (
    <div
      key={item.path}
      className={`flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/30 transition-colors group min-w-0 overflow-hidden ${item.is_cached === true ? "opacity-75" : ""}`}
      style={{
        animationDelay: `${index * 20}ms`,
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
        {item.type === "directory" ? (
          <>
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
          </>
        ) : (
          <>
            <div
              className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                item.required
                  ? "bg-primary/10 dark:bg-primary/20 group-hover:bg-primary/20 dark:group-hover:bg-primary/30"
                  : "bg-muted/50 group-hover:bg-muted/80"
              }`}
            >
              <File
                className={`h-3.5 w-3.5 transition-colors ${
                  item.required
                    ? "text-primary"
                    : "text-muted-foreground/40"
                }`}
              />
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
        {item.type === "file" && item.is_cached === true && (
          <Badge
            variant="outline"
            className="text-[10px] h-5 px-1.5 shrink-0 bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
          >
            Cached
          </Badge>
        )}
        {item.type === "file" &&
          item.required &&
          !allRequired &&
          item.is_cached !== true && (
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
  );

  return (
    <FileExplorerShell
      items={items}
      repoId={repoId}
      renderRow={renderRow}
    />
  );
}

export default PreviewFileTree;
