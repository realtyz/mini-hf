import { motion, AnimatePresence } from "framer-motion";
import { itemVariants } from "@/lib/animations/motion-config";
import { ScanSearch, RefreshCw, Search, X, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { ScanCategory } from "@/lib/api/types";
import type { SourceFilter } from "./use-cache-scan-filters";

interface CacheScanToolbarProps {
  isAdmin: boolean;
  isPending: boolean;
  onTrigger: () => void;
  onRefresh: () => void;
  categoryFilter: "all" | ScanCategory;
  setCategoryFilter: (v: "all" | ScanCategory) => void;
  sourceFilter: SourceFilter;
  setSourceFilter: (v: SourceFilter) => void;
  search: string;
  setSearch: (v: string) => void;
  filteredCount: number;
  totalCount: number;
  selectedCount: number;
  onBatchDelete: () => void;
  isBatchDeleting: boolean;
}

export function CacheScanToolbar({
  isAdmin,
  isPending,
  onTrigger,
  onRefresh,
  categoryFilter,
  setCategoryFilter,
  sourceFilter,
  setSourceFilter,
  search,
  setSearch,
  filteredCount,
  totalCount,
  selectedCount,
  onBatchDelete,
  isBatchDeleting,
}: CacheScanToolbarProps) {
  return (
    <>
      {/* Header — powered by shared PageHeader with actions slot */}
      <motion.div variants={itemVariants}>
        <PageHeader
          icon={ScanSearch}
          title="缓存扫描"
          subtitle="检测已追踪和未追踪仓库，精准掌握缓存空间使用情况"
          actions={
            <>
              {isAdmin && (
                <>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Button
                          variant="default"
                          size="sm"
                          disabled={isPending}
                          className="gap-1.5 cursor-pointer text-[13px] h-9 px-4 rounded-xl font-medium shadow-sm"
                        >
                          {isPending ? (
                            <RefreshCw className="size-3.5 animate-spin" />
                          ) : (
                            <Zap className="size-3.5" />
                          )}
                          {isPending ? "扫描中..." : "触发扫描"}
                        </Button>
                      </motion.div>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>确认触发扫描</AlertDialogTitle>
                        <AlertDialogDescription>
                          对 S3
                          存储进行全量扫描，按仓库归类并标记追踪状态。此操作可能需要几分钟。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={onTrigger}>
                          {isPending ? "扫描中..." : "开始扫描"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
              {selectedCount > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <motion.div
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isBatchDeleting}
                        className="gap-1.5 cursor-pointer text-[13px] h-9 px-4 rounded-xl font-medium border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 dark:border-red-800/60 dark:text-red-400 dark:hover:bg-red-950/50"
                      >
                        <Trash2 className="size-3.5" />
                        批量删除
                        <span className="tabular-nums ml-0.5">
                          ({selectedCount})
                        </span>
                      </Button>
                    </motion.div>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认批量删除仓库</AlertDialogTitle>
                      <AlertDialogDescription>
                        您即将删除{" "}
                        <span className="font-semibold text-foreground">
                          {selectedCount} 个仓库
                        </span>
                        。此操作将删除所有缓存文件、版本数据和数据库记录，所有数据将永久丢失！
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isBatchDeleting}>
                        取消
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={onBatchDelete}
                        disabled={isBatchDeleting}
                        className="border border-red-300 bg-transparent text-red-600 hover:bg-red-50 hover:border-red-400 dark:border-red-800/60 dark:text-red-400 dark:hover:bg-red-950/50"
                      >
                        确认删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRefresh}
                  className="gap-1.5 cursor-pointer text-[13px] h-9 px-4 rounded-xl font-medium"
                >
                  <RefreshCw className="size-3.5" />
                  刷新
                </Button>
              </motion.div>
            </>
          }
        />
      </motion.div>

      {/* Filter Bar */}
      <motion.div
        className="relative rounded-2xl border border-border/60 bg-card overflow-hidden"
        variants={itemVariants}
        whileHover={{
          boxShadow: "0 4px 24px -6px rgba(0, 0, 0, 0.06)",
        }}
        transition={{ duration: 0.25 }}
      >
        {/* Subtle top accent line */}
        <div className="absolute top-0 left-4 right-4 h-px bg-linear-to-r from-transparent via-border/40 to-transparent" />

        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <div className="flex items-center rounded-xl border border-border/60 bg-muted/30 p-1 gap-0.5">
            <button
              type="button"
              onClick={() => setCategoryFilter("all")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200 cursor-pointer",
                categoryFilter === "all"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              全部
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter("tracked")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200 cursor-pointer",
                categoryFilter === "tracked"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              已追踪
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter("untracked")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200 cursor-pointer",
                categoryFilter === "untracked"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              未追踪
            </button>
          </div>

          <div className="flex items-center rounded-xl border border-border/60 bg-muted/30 p-1 gap-0.5">
            <button
              type="button"
              onClick={() => setSourceFilter("all")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200 cursor-pointer",
                sourceFilter === "all"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              全部来源
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter("huggingface")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200 cursor-pointer",
                sourceFilter === "huggingface"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              HuggingFace
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter("modelscope")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200 cursor-pointer",
                sourceFilter === "modelscope"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              ModelScope
            </button>
          </div>

          <div className="relative flex-1 min-w-50 max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/50 pointer-events-none" />
            <Input
              type="search"
              placeholder="搜索仓库 ID 或标签..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9.5 h-9 rounded-xl border-border/60 text-[13px] transition-all duration-200 focus:ring-2 focus:ring-primary/15"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/40 hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={`${filteredCount}-${totalCount}`}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="ml-auto flex items-center gap-1.5 text-[13px] text-muted-foreground/60"
            >
              <span className="font-mono font-medium tabular-nums text-foreground/80">
                {filteredCount.toLocaleString()}
              </span>
              个仓库
              {filteredCount !== totalCount && (
                <>
                  <span className="text-muted-foreground/30">/</span>
                  <span className="font-mono tabular-nums text-muted-foreground/40">
                    {totalCount.toLocaleString()}
                  </span>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}
