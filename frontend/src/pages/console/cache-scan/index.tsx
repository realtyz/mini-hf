import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { containerVariants, itemVariants } from "@/lib/animations/motion-config";
import {
  ScanSearch,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { useCacheScanResult, useTriggerCacheScan, useDeleteRepo, useBatchDeleteRepos, useBatchDeleteStatus } from "@/hooks/api";
import { queryKeys } from "@/lib/query/keys";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { STRINGS } from "@/lib/constants/strings";
import type { ScanCategory } from "@/lib/api/types";

import { useCacheScanFilters } from "./use-cache-scan-filters";
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
            className="flex-1 rounded-2xl border border-border/40 bg-card p-5"
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <Skeleton className="size-9 rounded-xl" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-0.5 w-full" />
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
              <Skeleton className="h-5 w-10 rounded-lg" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-8" />
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
            <p className="text-sm font-semibold text-foreground">{STRINGS.cacheScanAllClear}</p>
            <p className="text-[12.5px] text-muted-foreground/60 mt-0.5">{STRINGS.cacheScanAllClearDesc}</p>
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
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const { result, isLoading, isError, refetch } = useCacheScanResult();
  const triggerScan = useTriggerCacheScan();
  const {
    search, setSearch,
    typeFilter, setTypeFilter,
    categoryFilter, setCategoryFilter,
    thresholdDays, setThresholdDays,
    customDays, setCustomDays,
    actualThreshold,
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
  const [batchDeleteResult, setBatchDeleteResult] = useState<BatchDeleteOperationState | null>(null);
  const completedOpRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const deleteRepo = useDeleteRepo();
  const batchDeleteRepos = useBatchDeleteRepos();
  const batchDeleteStatus = useBatchDeleteStatus(batchOperationId);

  // Filter setters that also clear selection
  const handleSetSearch = (v: string) => { setSearch(v); setSelectedIds(new Set()); };
  const handleSetTypeFilter = (v: string) => { setTypeFilter(v); setSelectedIds(new Set()); };
  const handleSetCategoryFilter = (v: "all" | ScanCategory) => { setCategoryFilter(v); setSelectedIds(new Set()); };

  useEffect(() => {
    const data = batchDeleteStatus.data?.data;
    if (!data || data.status !== 'completed') return;
    if (data.operation_id === completedOpRef.current) return;
    completedOpRef.current = data.operation_id;

    if (data.total_failed > 0) {
      toast.warning(STRINGS.cacheScanBatchDeleteCompletedWithFailures(data.total_deleted, data.total_failed));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBatchDeleteResult(data);
    } else {
      toast.success(STRINGS.cacheScanBatchDeleteCompleted(data.total_deleted));
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.cacheScan.result() });
    setBatchOperationId(null);
  }, [batchDeleteStatus.data, queryClient]);

  const handleTrigger = () => {
    triggerScan.mutate(actualThreshold, {
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

  const handleCopy = (repoId: string) => {
    navigator.clipboard.writeText(repoId).then(() => {
      setCopiedId(repoId);
      toast.success(STRINGS.cacheScanCopySuccess);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleDeleteClick = (repoId: string) => {
    setDeletingRepoId(repoId);
    setDeleteDialogOpen(true);
  };

  const handleClearFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setCategoryFilter("all");
    setSelectedIds(new Set());
  };

  const handleToggleSelect = (repoId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(repoId)) {
        next.delete(repoId);
      } else {
        next.add(repoId);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    const allFilteredIds = filteredRepos.map((r) => r.repo_id);
    const allSelected = allFilteredIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allFilteredIds));
    }
  };

  const handleBatchDelete = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const repoTypes: Record<string, string> = {};
    for (const repo of result?.repos ?? []) {
      if (selectedIds.has(repo.repo_id)) {
        repoTypes[repo.repo_id] = repo.repo_type;
      }
    }
    batchDeleteRepos.mutate(
      { repoIds: ids, repoTypes },
      {
        onSuccess: (data) => {
          setBatchOperationId(data.operation_id);
          setSelectedIds(new Set());
          toast.success(STRINGS.cacheScanBatchDeleteStarted(ids.length));
        },
        onError: () => {
          toast.error("批量删除启动失败，请重试");
        },
      }
    );
  };

  const handleConfirmDelete = () => {
    if (!deletingRepoId) return;
    const repo = result?.repos.find((r) => r.repo_id === deletingRepoId);
    deleteRepo.mutate(
      { repoId: deletingRepoId, repoType: repo?.repo_type },
      {
        onSuccess: () => {
          toast.success(STRINGS.cacheScanDeleteSuccess);
          queryClient.invalidateQueries({ queryKey: queryKeys.cacheScan.result() });
          setDeleteDialogOpen(false);
          setDeletingRepoId(null);
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "删除失败，请重试");
        },
      }
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
      {/* Page background texture — subtle grid */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.015] dark:opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse 60% 50% at 50% 40%, black 30%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse 60% 50% at 50% 40%, black 30%, transparent 70%)",
        }}
      />

      <CacheScanToolbar
        isAdmin={isAdmin}
        isPending={triggerScan.isPending}
        thresholdDays={thresholdDays}
        setThresholdDays={setThresholdDays}
        customDays={customDays}
        setCustomDays={setCustomDays}
        actualThreshold={actualThreshold}
        onTrigger={handleTrigger}
        onRefresh={() => refetch()}
        typeFilter={typeFilter}
        setTypeFilter={handleSetTypeFilter}
        categoryFilter={categoryFilter}
        setCategoryFilter={handleSetCategoryFilter}
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
                    <RefreshCw className={cn("size-4", triggerScan.isPending && "animate-spin")} />
                    {triggerScan.isPending ? STRINGS.cacheScanScanning : STRINGS.cacheScanTrigger}
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
                onSort={setSort}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <CleanupConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        repoId={deletingRepoId}
        isDeleting={deleteRepo.isPending}
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
