import { memo, useRef } from "react";
import { motion } from "framer-motion";
import { useVirtualizer } from "@tanstack/react-virtual";
import { itemVariants } from "@/lib/animations/motion-config";
import { useNavigate } from "react-router";
import {
  Copy,
  Check,
  Search,
  Trash2,
  ArrowUp,
  ArrowDown,
  GripHorizontal,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatBytes } from "@/lib/utils";
import type { RepoScanItem } from "@/lib/api/types";
import type { SortField, SortDirection } from "./use-cache-scan-filters";

const repoTypeLabels: Record<string, string> = {
  model: "模型",
  dataset: "数据集",
};

// Estimated row height for virtualization. Rows use a single line of badges
// and text with `py-3`, so the height is effectively uniform. The virtualizer
// is given this estimate; if a row ever deviates the overscan absorbs it.
const ROW_HEIGHT = 56;

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

interface CacheScanTableProps {
  repos: RepoScanItem[];
  isAdmin: boolean;
  copiedId: string | null;
  onCopy: (repoId: string) => void;
  onDelete: (repoId: string) => void;
  onClearFilters: () => void;
  search: string;
  selectedIds: Set<string>;
  onToggleSelect: (repoId: string) => void;
  onToggleSelectAll: () => void;
  sortField: SortField | null;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}

function SortIcon({
  field,
  sortField,
  sortDirection,
}: {
  field: SortField;
  sortField: SortField | null;
  sortDirection: SortDirection;
}) {
  if (sortField !== field) {
    return (
      <span className="inline-flex flex-col ml-1 opacity-0 group-hover/sort:opacity-40 transition-opacity">
        <ArrowUp className="size-2.5 -mb-0.5" />
        <ArrowDown className="size-2.5" />
      </span>
    );
  }
  return sortDirection === "asc" ? (
    <ArrowUp className="size-3 ml-1 text-primary" />
  ) : (
    <ArrowDown className="size-3 ml-1 text-primary" />
  );
}

function SortableHeader({
  field,
  label,
  sortField,
  sortDirection,
  onSort,
}: {
  field: SortField;
  label: string;
  sortField: SortField | null;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}) {
  const isActive = sortField === field;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={cn(
        "inline-flex items-center justify-center gap-0.5 cursor-pointer group/sort transition-colors rounded-md px-1.5 py-0.5 -mx-1.5",
        isActive
          ? "text-foreground bg-muted/40"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/20",
      )}
    >
      <span className="text-[11px] font-semibold tracking-wider uppercase select-none">
        {label}
      </span>
      <SortIcon
        field={field}
        sortField={sortField}
        sortDirection={sortDirection}
      />
    </button>
  );
}

interface CacheScanRowProps {
  repo: RepoScanItem;
  isAdmin: boolean;
  isCopied: boolean;
  isSelected: boolean;
  onCopy: (repoId: string) => void;
  onDelete: (repoId: string) => void;
  onToggleSelect: (repoId: string) => void;
}

// Memoized row: re-renders only when its own props change (e.g. its own
// selection/copied state flips), not when the parent re-renders due to an
// unrelated row being toggled. Relies on stable callback identities from
// the parent (useCallback).
const CacheScanRow = memo(function CacheScanRow({
  repo,
  isAdmin,
  isCopied,
  isSelected,
  onCopy,
  onDelete,
  onToggleSelect,
}: CacheScanRowProps) {
  const navigate = useNavigate();
  return (
    <TableRow
      className={cn(
        "group border-b border-border/30 last:border-0 transition-colors",
        isSelected ? "bg-primary/4 hover:bg-primary/7" : "hover:bg-muted/20",
      )}
    >
      <TableCell className="py-3 pl-5">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(repo.repo_id)}
          aria-label={`选择 ${repo.repo_id}`}
        />
      </TableCell>

      <TableCell className="text-[13px] py-3 pl-4">
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onCopy(repo.repo_id)}
                className="font-mono font-medium text-left hover:text-primary transition-colors cursor-pointer rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring inline-flex items-center gap-1.5 max-w-70"
              >
                <span className="truncate text-[12.5px] text-foreground/80">
                  {repo.repo_id}
                </span>
                {isCopied ? (
                  <Check className="size-3 text-emerald-500 shrink-0" />
                ) : (
                  <Copy className="size-3 text-muted-foreground/0 group-hover:text-muted-foreground/30 shrink-0 transition-all duration-200" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="rounded-lg">
              <p className="text-xs font-mono">点击复制: {repo.repo_id}</p>
            </TooltipContent>
          </Tooltip>
          <Badge
            variant={repo.repo_type === "model" ? "secondary" : "outline"}
            className={cn(
              "text-[11px] font-medium rounded-lg px-2.5 py-0.5 shrink-0",
              repo.repo_type === "model"
                ? "bg-slate-100 text-slate-600 border-slate-200/50 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700/50"
                : "bg-amber-50 text-amber-700 border-amber-200/50 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/40",
            )}
          >
            {repoTypeLabels[repo.repo_type] ?? repo.repo_type}
          </Badge>
        </div>
      </TableCell>

      <TableCell className="py-3 text-center">
        <Badge
          variant={repo.category === "tracked" ? "secondary" : "outline"}
          className={cn(
            "text-[11px] font-medium rounded-lg px-2.5 py-0.5",
            repo.category === "tracked"
              ? "bg-blue-50 text-blue-700 border-blue-200/50 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/40"
              : "bg-purple-50 text-purple-700 border-purple-200/50 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800/40",
          )}
        >
          {repo.category === "tracked" ? "已追踪" : "未追踪"}
        </Badge>
      </TableCell>

      <TableCell className="py-3 text-center">
        <Badge
          variant="outline"
          className={cn(
            "text-[11px] font-medium rounded-lg px-2.5 py-0.5",
            repo.source === "modelscope"
              ? "bg-teal-50 text-teal-700 border-teal-200/50 dark:bg-teal-950/30 dark:text-teal-300 dark:border-teal-800/40"
              : "bg-sky-50 text-sky-700 border-sky-200/50 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800/40",
          )}
        >
          {repo.source === "modelscope" ? "ModelScope" : "HuggingFace"}
        </Badge>
      </TableCell>

      <TableCell className="text-[13px] text-center tabular-nums py-3 font-medium text-foreground/70">
        {repo.downloads.toLocaleString()}
      </TableCell>

      <TableCell className="text-[13px] text-center tabular-nums py-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 text-foreground/80 font-medium cursor-default">
              <span className="tabular-nums">
                {formatBytes(repo.cached_size)}
              </span>
            </span>
          </TooltipTrigger>
          <TooltipContent className="rounded-lg">
            <p className="text-xs font-mono tabular-nums">
              {repo.cached_size.toLocaleString("zh-CN")} 字节
            </p>
          </TooltipContent>
        </Tooltip>
      </TableCell>

      <TableCell className="text-[13px] text-muted-foreground py-3 text-center">
        {repo.last_downloaded_at ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground/60 tabular-nums cursor-default">
                {formatRelativeTime(repo.last_downloaded_at)}
              </span>
            </TooltipTrigger>
            <TooltipContent className="rounded-lg">
              <p className="text-xs tabular-nums">
                {formatDate(repo.last_downloaded_at)}
              </p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground/25 italic text-[12px] select-none">
            —
          </span>
        )}
      </TableCell>

      <TableCell className="text-[13px] text-muted-foreground py-3 text-center">
        {repo.cache_updated_at ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground/60 tabular-nums cursor-default">
                {formatRelativeTime(repo.cache_updated_at)}
              </span>
            </TooltipTrigger>
            <TooltipContent className="rounded-lg">
              <p className="text-xs tabular-nums">
                {formatDate(repo.cache_updated_at)}
              </p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground/25 italic text-[12px] select-none">
            —
          </span>
        )}
      </TableCell>

      <TableCell className="py-3 pr-5 text-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 opacity-0 group-hover:opacity-100 transition-all duration-150 rounded-lg"
            >
              <GripHorizontal className="size-3.5 text-muted-foreground/60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-44 rounded-xl"
            sideOffset={4}
          >
            <DropdownMenuItem
              onClick={() => onCopy(repo.repo_id)}
              className="text-[13px] cursor-pointer rounded-lg"
            >
              <Copy className="size-3.5 mr-2.5" />
              复制仓库 ID
            </DropdownMenuItem>
            {repo.category === "tracked" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-[13px] cursor-pointer rounded-lg"
                  onClick={() => {
                    navigate(
                      `/console/repositories/detail?repoId=${encodeURIComponent(repo.repo_id)}&type=${repo.repo_type}&source=${repo.source}`,
                    );
                  }}
                >
                  <ExternalLink className="size-3.5 mr-2.5" />
                  查看仓库详情
                </DropdownMenuItem>
              </>
            )}
            {isAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(repo.repo_id)}
                  className="text-[13px] cursor-pointer text-destructive focus:text-destructive rounded-lg"
                >
                  <Trash2 className="size-3.5 mr-2.5" />
                  删除仓库
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
});

export function CacheScanTable({
  repos,
  isAdmin,
  copiedId,
  onCopy,
  onDelete,
  onClearFilters,
  search,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  sortField,
  sortDirection,
  onSort,
}: CacheScanTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: repos.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const allSelected =
    repos.length > 0 && repos.every((r) => selectedIds.has(r.repo_id));
  const someSelected =
    repos.some((r) => selectedIds.has(r.repo_id)) && !allSelected;

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0 ? totalSize - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <motion.div
      className="relative rounded-2xl border border-border/60 bg-card overflow-hidden"
      variants={itemVariants}
    >
      {/* Subtle top accent line */}
      <div className="absolute top-0 left-4 right-4 h-px bg-linear-to-r from-transparent via-border/40 to-transparent" />

      {repos.length === 0 ? (
        <div className="flex h-72 items-center justify-center">
          <div className="text-center">
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="relative mx-auto w-fit mb-5"
            >
              <div className="size-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                <Search className="size-6 text-muted-foreground/30" />
              </div>
            </motion.div>
            <motion.p
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="text-sm text-muted-foreground/70"
            >
              未找到匹配{" "}
              <span className="font-mono font-medium text-foreground/50 bg-muted/50 px-1.5 py-0.5 rounded-md">
                {search}
              </span>{" "}
              的仓库
            </motion.p>
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={onClearFilters}
                className="mt-4 gap-2 cursor-pointer rounded-xl text-[13px]"
              >
                清除所有筛选
              </Button>
            </motion.div>
          </div>
        </div>
      ) : (
        // A single shared TooltipProvider wraps the whole table so each row no
        // longer instantiates its own provider (previously N×4 providers).
        <TooltipProvider delayDuration={200}>
          <div ref={scrollRef} className="max-h-[70vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30 border-b border-border/50 sticky top-0 z-10">
                  <TableHead className="w-12 pl-5">
                    <Checkbox
                      checked={allSelected}
                      data-state={someSelected ? "indeterminate" : undefined}
                      onCheckedChange={() => onToggleSelectAll()}
                      aria-label="全选"
                    />
                  </TableHead>
                  <TableHead className="w-75 pl-4">
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
                      仓库 ID
                    </span>
                  </TableHead>
                  <TableHead className="w-17.5 text-center">
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
                      分类
                    </span>
                  </TableHead>
                  <TableHead className="w-24 text-center">
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
                      来源
                    </span>
                  </TableHead>
                  <TableHead className="w-22.5 text-center">
                    <SortableHeader
                      field="downloads"
                      label="下载量"
                      sortField={sortField}
                      sortDirection={sortDirection}
                      onSort={onSort}
                    />
                  </TableHead>
                  <TableHead className="w-22.5 text-center">
                    <SortableHeader
                      field="cached_size"
                      label="缓存"
                      sortField={sortField}
                      sortDirection={sortDirection}
                      onSort={onSort}
                    />
                  </TableHead>
                  <TableHead className="w-37.5 text-center">
                    <SortableHeader
                      field="last_downloaded_at"
                      label="最后下载"
                      sortField={sortField}
                      sortDirection={sortDirection}
                      onSort={onSort}
                    />
                  </TableHead>
                  <TableHead className="w-37.5 text-center">
                    <SortableHeader
                      field="cache_updated_at"
                      label="缓存更新时间"
                      sortField={sortField}
                      sortDirection={sortDirection}
                      onSort={onSort}
                    />
                  </TableHead>
                  <TableHead className="w-15 pr-5 text-center">
                    <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground select-none">
                      操作
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paddingTop > 0 && (
                  <tr aria-hidden="true" style={{ height: paddingTop }} />
                )}
                {virtualItems.map((virtualRow) => {
                  const repo = repos[virtualRow.index];
                  return (
                    <CacheScanRow
                      key={repo.repo_id}
                      repo={repo}
                      isAdmin={isAdmin}
                      isCopied={copiedId === repo.repo_id}
                      isSelected={selectedIds.has(repo.repo_id)}
                      onCopy={onCopy}
                      onDelete={onDelete}
                      onToggleSelect={onToggleSelect}
                    />
                  );
                })}
                {paddingBottom > 0 && (
                  <tr aria-hidden="true" style={{ height: paddingBottom }} />
                )}
              </TableBody>
            </Table>
          </div>
        </TooltipProvider>
      )}
    </motion.div>
  );
}
