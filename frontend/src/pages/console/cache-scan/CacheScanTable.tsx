import { motion } from "framer-motion";
import { itemVariants } from "@/lib/animations/motion-config";
import {
  Copy,
  Check,
  MoreHorizontal,
  ArrowUpRight,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { RepoScanItem } from "@/lib/api-types";

const repoTypeLabels: Record<string, string> = {
  model: "模型",
  dataset: "数据集",
};

const repoTypeBadgeVariants: Record<string, "secondary" | "outline"> = {
  model: "secondary",
  dataset: "outline",
};

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

interface CacheScanTableProps {
  repos: RepoScanItem[];
  isAdmin: boolean;
  copiedId: string | null;
  onCopy: (repoId: string) => void;
  onDelete: (repoId: string) => void;
  onClearFilters: () => void;
  search: string;
}

export function CacheScanTable({
  repos,
  isAdmin,
  copiedId,
  onCopy,
  onDelete,
  onClearFilters,
  search,
}: CacheScanTableProps) {
  return (
    <motion.div
      className="rounded-xl border bg-card overflow-hidden"
      variants={itemVariants}
    >
      {repos.length === 0 ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl bg-muted p-5 mb-4 mx-auto w-fit"
            >
              <Search className="size-8 text-muted-foreground" />
            </motion.div>
            <motion.p
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="text-sm text-muted-foreground"
            >
              未找到匹配{" "}
              <span className="font-mono font-medium text-foreground/60">
                &quot;{search}&quot;
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
                className="mt-3 gap-2 cursor-pointer"
              >
                清除所有筛选
              </Button>
            </motion.div>
          </div>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border/50">
              <TableHead className="w-75 pl-4 font-semibold text-xs">
                仓库 ID
              </TableHead>
              <TableHead className="w-17.5 font-semibold text-xs text-center">
                分类
              </TableHead>
              <TableHead className="w-20 font-semibold text-xs text-center">
                类型
              </TableHead>
              <TableHead className="w-22.5 text-center font-semibold text-xs">
                下载量
              </TableHead>
              <TableHead className="w-20 text-center font-semibold text-xs">
                快照
              </TableHead>
              <TableHead className="w-22.5 text-center font-semibold text-xs">
                缓存
              </TableHead>
              <TableHead className="w-37.5 font-semibold text-xs text-center">
                最后下载
              </TableHead>
              <TableHead className="w-37.5 font-semibold text-xs text-center">
                缓存更新时间
              </TableHead>
              <TableHead className="w-10 pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {repos.map((repo: RepoScanItem) => (
              <TableRow
                key={repo.repo_id}
                className="group border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors"
              >
                <TableCell className="text-[13px] py-2.5 pl-4">
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => onCopy(repo.repo_id)}
                          className="font-mono font-medium text-left hover:text-primary transition-colors cursor-pointer rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring inline-flex items-center gap-1.5 max-w-70"
                        >
                          <span className="truncate">
                            {repo.repo_id}
                          </span>
                          {copiedId === repo.repo_id ? (
                            <Check className="size-3 text-emerald-500 shrink-0" />
                          ) : (
                            <Copy className="size-3 text-muted-foreground/0 group-hover:text-muted-foreground/40 shrink-0 transition-all" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" align="start">
                        <p className="text-xs">
                          点击复制: {repo.repo_id}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>

                <TableCell className="py-2.5 text-center">
                  <Badge
                    variant={repo.category === "cold" ? "destructive" : "outline"}
                    className={cn(
                      "text-[11px] font-medium",
                      repo.category === "orphan" && "border-amber-500/50 text-amber-700 dark:text-amber-400",
                    )}
                  >
                    {repo.category === "cold" ? "冷仓库" : "孤儿"}
                  </Badge>
                </TableCell>

                <TableCell className="py-2.5 text-center">
                  <Badge
                    variant={
                      repoTypeBadgeVariants[repo.repo_type] ??
                      "secondary"
                    }
                    className="text-[11px] font-medium"
                  >
                    {repoTypeLabels[repo.repo_type] ?? repo.repo_type}
                  </Badge>
                </TableCell>

                <TableCell className="text-[13px] text-center tabular-nums py-2.5">
                  {(repo.downloads).toLocaleString()}
                </TableCell>

                <TableCell className="text-[13px] text-center tabular-nums py-2.5">
                  {(repo.cached_commits).toLocaleString()}
                </TableCell>

                <TableCell className="text-[13px] text-center tabular-nums py-2.5">
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-foreground/80 cursor-default">
                          {formatBytes(repo.cached_size)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs tabular-nums">
                          {repo.cached_size.toLocaleString("zh-CN")}{" "}
                          字节
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>

                <TableCell className="text-[13px] text-muted-foreground py-2.5 text-center">
                  {repo.last_downloaded_at ? (
                    <span className="text-muted-foreground/70">
                      {formatDate(repo.last_downloaded_at)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40 italic text-[12px]">
                      无记录
                    </span>
                  )}
                </TableCell>

                <TableCell className="text-[13px] text-muted-foreground py-2.5 text-center">
                  {repo.cache_updated_at ? (
                    <span className="text-muted-foreground/70">
                      {formatDate(repo.cache_updated_at)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40 italic text-[12px]">
                      无记录
                    </span>
                  )}
                </TableCell>

                <TableCell className="py-2.5 pr-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreHorizontal className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        onClick={() => onCopy(repo.repo_id)}
                        className="text-[13px] cursor-pointer"
                      >
                        <Copy className="size-3.5 mr-2" />
                        复制仓库 ID
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-[13px] cursor-pointer"
                        onClick={() => {
                          window.open(
                            `https://huggingface.co/${repo.repo_id}`,
                            "_blank",
                          );
                        }}
                      >
                        <ArrowUpRight className="size-3.5 mr-2" />
                        在 HF 查看
                      </DropdownMenuItem>
                      {isAdmin && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onDelete(repo.repo_id)}
                            className="text-[13px] cursor-pointer text-destructive focus:text-destructive"
                          >
                            <Trash2 className="size-3.5 mr-2" />
                            删除仓库
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </motion.div>
  );
}
