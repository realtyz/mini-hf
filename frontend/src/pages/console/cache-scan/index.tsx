import { useState } from "react";
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
import { useCacheScanResult, useTriggerCacheScan, useDeleteRepo } from "@/hooks/api";
import { queryKeys } from "@/lib/query/keys";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { STRINGS } from "@/lib/constants/strings";

import { useCacheScanFilters } from "./use-cache-scan-filters";
import { CacheScanStats } from "./CacheScanStats";
import { CacheScanToolbar } from "./CacheScanToolbar";
import { CacheScanTable } from "./CacheScanTable";
import { CleanupConfirmDialog } from "./CleanupConfirmDialog";

// =============================================================================
// Sub-Components
// =============================================================================

function CacheScanSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-8">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-xl" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 flex-1 max-w-sm" />
          <Skeleton className="h-4 w-20 ml-auto" />
        </div>
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-6 py-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 py-3 border-b border-border/40 last:border-0"
            >
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16 ml-auto" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-36" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AllClearState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center gap-3 p-4">
          <div className="size-9 rounded-lg bg-emerald-500/15 flex items-center justify-center">
            <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-medium">{STRINGS.cacheScanAllClear}</p>
            <p className="text-xs text-muted-foreground/70">{STRINGS.cacheScanAllClearDesc}</p>
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
    filteredRepos,
  } = useCacheScanFilters(result);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRepoId, setDeletingRepoId] = useState<string | null>(null);
  const [hardDelete, setHardDelete] = useState(false);
  const queryClient = useQueryClient();
  const deleteRepo = useDeleteRepo();

  const handleTrigger = () => {
    triggerScan.mutate(actualThreshold, {
      onSuccess: (data) => {
        toast.success(
          `扫描完成：发现 ${data.data?.total_cold_repos ?? 0} 个冷仓库，${data.data?.total_orphan_repos ?? 0} 个孤儿仓库`,
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
    setHardDelete(false);
  };

  const handleClearFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setCategoryFilter("all");
  };

  const handleConfirmDelete = () => {
    if (!deletingRepoId) return;
    deleteRepo.mutate(
      { repoId: deletingRepoId, hard: hardDelete },
      {
        onSuccess: () => {
          toast.success(hardDelete ? STRINGS.cacheScanHardDeleteSuccess : STRINGS.cacheScanColdDeleteSuccess);
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

  const hasResults = result && (result.total_cold_repos > 0 || result.total_orphan_repos > 0);

  return (
    <motion.div
      className="flex flex-1 flex-col gap-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
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
        setTypeFilter={setTypeFilter}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        search={search}
        setSearch={setSearch}
        filteredCount={filteredRepos.length}
        totalCount={result?.repos.length ?? 0}
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
                    className="gap-2 cursor-pointer"
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
              totalColdRepos={result.total_cold_repos}
              totalOrphanRepos={result.total_orphan_repos}
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
        hardDelete={hardDelete}
        onHardDeleteChange={setHardDelete}
        onConfirm={handleConfirmDelete}
      />
    </motion.div>
  );
}

export default CacheScan;
