import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  containerVariants,
  itemVariants,
} from "@/lib/animations/motion-config";
import { ScanSearch, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import {
  useCacheScanResult,
  useTriggerCacheScan,
  useDeleteRepo,
  useBatchDeleteRepos,
  useBatchDeleteStatus,
} from "@/hooks/api";
import { queryKeys } from "@/lib/query/keys";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { STRINGS } from "@/lib/constants/strings";
import type { ScanCategory } from "@/lib/api/types";

import { useCacheScanFilters } from "./use-cache-scan-filters";
import type { SortField } from "./use-cache-scan-filters";
import { CacheScanStats } from "./CacheScanStats";
import { CacheScanToolbar } from "./CacheScanToolbar";
import { CacheScanTable } from "./CacheScanTable";
import { CleanupConfirmDialog } from "./CleanupConfirmDialog";
import { BatchDeleteResultDialog } from "./BatchDeleteResultDialog";
import type { BatchDeleteOperationState } from "@/lib/api/types";

// =============================================================================
// Skeleton — loading state matching the instrument panel layout
// =============================================================================

function CacheScanSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats skeleton */}
      <div className="flex items-stretch gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-xl border border-border/50 bg-card px-5 py-4"
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Skeleton className="size-4" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-3.5 w-28" />
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar skeleton */}
      <div className="rounded-2xl border border-border/40 bg-card p-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-52" />
          <Skeleton className="h-9 flex-1 max-w-sm" />
          <Skeleton className="h-4 w-20 ml-auto" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="rounded-2xl border border-border/40 bg-card overflow-hidden">
        <div className="px-5 py-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 py-3.5 border-b border-border/30 last:border-0"
            >
              <Skeleton className="size-4 rounded" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-5 w-12 rounded-lg" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-7 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// All-Clear State — displayed when scan is complete but no repos found
// =============================================================================

function AllClearState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="relative rounded-2xl border border-emerald-200/60 dark:border-emerald-800/30 bg-emerald-50/30 dark:bg-emerald-950/10 overflow-hidden">
        {/* Top accent line */}
        <div className="absolute top-0 left-4 right-4 h-px bg-linear-to-r from-transparent via-emerald-300/40 to-transparent" />
        <div className="flex items-center gap-4 p-5">
          <div className="size-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <ShieldCheck className="size-4.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {STRINGS.cacheScanAllClear}
            </p>
            <p className="text-[12.5px] text-muted-foreground/60 mt-0.5">
              {STRINGS.cacheScanAllClearDesc}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function CacheScan() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "admin";
  const { result, isLoading, isError, refetch } = useCacheScanResult();
  const triggerScan = useTriggerCacheScan();
  const {
    search,
    setSearch,
    categoryFilter,
    setCategoryFilter,
    sourceFilter,
    setSourceFilter,
    sortField,
    sortDirection,
    setSort,
    filteredRepos,
  } = useCacheScanFilters(result);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRepoId, setDeletingRepoId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchOperationId, setBatchOperationId] = useState<string | null>(null);
  const [batchDeleteResult, setBatchDeleteResult] =
    useState<BatchDeleteOperationState | null>(null);
  const completedOpRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const deleteRepoHf = useDeleteRepo("huggingface");
  const deleteRepoMs = useDeleteRepo("modelscope");
  const batchDeleteRepos = useBatchDeleteRepos();
  const batchDeleteStatus = useBatchDeleteStatus(batchOperationId);

  // Wrap the filter setters so changing the search/category also clears the
  // selection — otherwise stale ids could linger for items no longer in view.
  const handleSetSearch = useCallback(
    (v: string) => {
      setSearch(v);
      setSelectedIds(new Set());
    },
    [setSearch],
  );
  const handleSetCategoryFilter = useCallback(
    (v: "all" | ScanCategory) => {
      setCategoryFilter(v);
      setSelectedIds(new Set());
    },
    [setCategoryFilter],
  );
  const handleSetSourceFilter = useCallback(
    (v: "all" | "huggingface" | "modelscope") => {
      setSourceFilter(v);
      setSelectedIds(new Set());
    },
    [setSourceFilter],
  );

  useEffect(() => {
    const data = batchDeleteStatus.data?.data;
    if (!data || data.status !== "completed") return;
    if (data.operation_id === completedOpRef.current) return;
    completedOpRef.current = data.operation_id;

    if (data.total_failed > 0) {
      toast.warning(
        STRINGS.cacheScanBatchDeleteCompletedWithFailures(
          data.total_deleted,
          data.total_failed,
        ),
      );
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBatchDeleteResult(data);
    } else {
      toast.success(STRINGS.cacheScanBatchDeleteCompleted(data.total_deleted));
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.cacheScan.result() });
    setBatchOperationId(null);
  }, [batchDeleteStatus.data, queryClient]);

  const handleTrigger = () => {
    triggerScan.mutate(undefined, {
      onSuccess: (data) => {
        toast.success(
          `扫描完成：发现 ${data.data?.total_tracked_repos ?? 0} 个已追踪仓库，${data.data?.total_untracked_repos ?? 0} 个未追踪仓库`,
        );
      },
      onError: () => {
        toast.error("扫描失败，请重试");
      },
    });
  };

  // Stable shared handlers so memoized CacheScanRow instances don't re-render
  // when the parent re-renders (e.g. on selection/copiedId changes).
  const handleCopy = useCallback((repoId: string) => {
    navigator.clipboard.writeText(repoId).then(() => {
      setCopiedId(repoId);
      toast.success(STRINGS.cacheScanCopySuccess);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  const handleDeleteClick = useCallback((repoId: string) => {
    setDeletingRepoId(repoId);
    setDeleteDialogOpen(true);
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearch("");
    setCategoryFilter("all");
    setSourceFilter("all");
    setSelectedIds(new Set());
  }, [setSearch, setCategoryFilter, setSourceFilter]);

  const handleToggleSelect = useCallback((repoId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(repoId)) {
        next.delete(repoId);
      } else {
        next.add(repoId);
      }
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allFilteredIds = filteredRepos.map((r) => r.repo_id);
      const allSelected =
        allFilteredIds.length > 0 &&
        allFilteredIds.every((id) => prev.has(id));
      if (allSelected) {
        return new Set();
      }
      return new Set(allFilteredIds);
    });
  }, [filteredRepos]);

  const handleSort = useCallback(
    (field: SortField) => {
      setSort(field);
    },
    [setSort],
  );

  const handleBatchDelete = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const repoTypes: Record<string, string> = {};
    const sources: Record<string, string> = {};
    for (const repo of result?.repos ?? []) {
      if (selectedIds.has(repo.repo_id)) {
        repoTypes[repo.repo_id] = repo.repo_type;
        sources[repo.repo_id] = repo.source;
      }
    }
    batchDeleteRepos.mutate(
      { repoIds: ids, repoTypes, sources },
      {
        onSuccess: (data) => {
          setBatchOperationId(data.operation_id);
          setSelectedIds(new Set());
          toast.success(STRINGS.cacheScanBatchDeleteStarted(ids.length));
        },
        onError: () => {
          toast.error("批量删除启动失败，请重试");
        },
      },
    );
  };

  const handleConfirmDelete = () => {
    if (!deletingRepoId) return;
    const repo = result?.repos.find((r) => r.repo_id === deletingRepoId);
    const deleteRepo = repo?.source === "modelscope" ? deleteRepoMs : deleteRepoHf;
    deleteRepo.mutate(
      { repoId: deletingRepoId, repoType: repo?.repo_type },
      {
        onSuccess: () => {
          toast.success(STRINGS.cacheScanDeleteSuccess);
          queryClient.invalidateQueries({
            queryKey: queryKeys.cacheScan.result(),
          });
          setDeleteDialogOpen(false);
          setDeletingRepoId(null);
        },
        onError: (error) => {
          toast.error(
            error instanceof Error ? error.message : "删除失败，请重试",
          );
        },
      },
    );
  };

  const hasResults = result && result.repos.length > 0;

  return (
    <motion.div
      className="relative flex flex-1 flex-col gap-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <CacheScanToolbar
        isAdmin={isAdmin}
        isPending={triggerScan.isPending}
        onTrigger={handleTrigger}
        onRefresh={() => refetch()}
        categoryFilter={categoryFilter}
        setCategoryFilter={handleSetCategoryFilter}
        sourceFilter={sourceFilter}
        setSourceFilter={handleSetSourceFilter}
        search={search}
        setSearch={handleSetSearch}
        filteredCount={filteredRepos.length}
        totalCount={result?.repos.length ?? 0}
        selectedCount={selectedIds.size}
        onBatchDelete={handleBatchDelete}
        isBatchDeleting={batchDeleteRepos.isPending}
      />

      <AnimatePresence mode="wait">
        {isError && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <ErrorState
              message={STRINGS.cacheScanLoadFailed}
              description={STRINGS.cacheScanLoadFailedDesc}
              onRetry={() => refetch()}
            />
          </motion.div>
        )}

        {isLoading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CacheScanSkeleton />
          </motion.div>
        )}

        {!isLoading && !isError && !result && (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
          >
            <EmptyState
              icon={<ScanSearch className="size-8 text-muted-foreground" />}
              message={STRINGS.cacheScanNoResults}
              description={STRINGS.cacheScanDescription}
            >
              {isAdmin && (
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.25 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="mt-4"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTrigger}
                    disabled={triggerScan.isPending}
                    className="gap-2 cursor-pointer rounded-xl"
                  >
                    <RefreshCw
                      className={cn(
                        "size-4",
                        triggerScan.isPending && "animate-spin",
                      )}
                    />
                    {triggerScan.isPending
                      ? STRINGS.cacheScanScanning
                      : STRINGS.cacheScanTrigger}
                  </Button>
                </motion.div>
              )}
            </EmptyState>
          </motion.div>
        )}

        {result && (
          <motion.div
            key="results"
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6"
          >
            <CacheScanStats
              scannedAt={result.scanned_at}
              totalTrackedRepos={result.total_tracked_repos}
              totalUntrackedRepos={result.total_untracked_repos}
              totalWastedBytes={result.total_wasted_bytes}
            />

            {!hasResults && <AllClearState />}

            {hasResults && (
              <CacheScanTable
                repos={filteredRepos}
                isAdmin={isAdmin}
                copiedId={copiedId}
                onCopy={handleCopy}
                onDelete={handleDeleteClick}
                onClearFilters={handleClearFilters}
                search={search}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onToggleSelectAll={handleToggleSelectAll}
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <CleanupConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        repoId={deletingRepoId}
        isDeleting={deleteRepoHf.isPending || deleteRepoMs.isPending}
        onConfirm={handleConfirmDelete}
      />

      <BatchDeleteResultDialog
        open={batchDeleteResult !== null}
        onOpenChange={(open) => {
          if (!open) setBatchDeleteResult(null);
        }}
        results={batchDeleteResult?.results ?? []}
        totalRequested={batchDeleteResult?.total_requested ?? 0}
      />
    </motion.div>
  );
}

export default CacheScan;
