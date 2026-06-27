import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Check,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileTreeSelector } from "@/components/tasks/FileTreeSelector";
import { useTaskActions } from "@/hooks/api/use-task-actions";
import { queryKeys } from "@/lib/query/keys";
import { formatBytes } from "@/lib/utils";
import api from "@/lib/api/client";
import endpoints from "@/lib/api/endpoints";
import type { TaskPreviewResponse } from "@/lib/api/types";

interface RetryTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: number;
  repoId: string;
  revision: string;
  /** Called after a successful retry to refresh parent lists */
  onRetrySuccess?: () => void;
}

type Step = "loading" | "preview" | "retrying";

const contentVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

export function RetryTaskDialog({
  open,
  onOpenChange,
  taskId,
  repoId,
  revision,
  onRetrySuccess,
}: RetryTaskDialogProps) {
  const [retryingStep, setRetryingStep] = useState<Step>("preview");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  const { retryTask } = useTaskActions();

  // Fetch retry preview — only when dialog is open with a valid taskId
  const previewQuery = useQuery({
    queryKey: queryKeys.tasks.retryPreview(taskId),
    queryFn: async () => {
      const response = await api.get<TaskPreviewResponse>(
        endpoints.task.retryPreview(taskId),
      );
      return response.data;
    },
    enabled: open && taskId > 0,
    staleTime: 0, // Always refetch when dialog opens
  });

  const previewData = previewQuery.data ?? null;
  const previewError = previewQuery.error
    ? ((previewQuery.error as { message?: string }).message ??
      "获取重试预览失败")
    : null;

  // Pre-select all non-cached files when preview data arrives
  const defaultSelected = useMemo(() => {
    if (!previewData) return new Set<string>();
    return new Set(
      (previewData.items ?? [])
        .filter((item) => item.type === "file" && !item.is_cached)
        .map((item) => item.path),
    );
  }, [previewData]);

  // Use user selection if they've interacted, otherwise default
  const effectiveSelected =
    selectedFiles.size > 0 || previewData === null
      ? selectedFiles
      : defaultSelected;

  // Computed stats based on current selection — only files that will actually
  // be downloaded. Cached files are excluded since they won't be re-fetched.
  const selectedStats = useMemo(() => {
    let count = 0;
    let size = 0;
    for (const item of previewData?.items ?? []) {
      if (item.type !== "file") continue;
      if (item.is_cached) continue;
      if (effectiveSelected.has(item.path)) {
        count++;
        size += item.size;
      }
    }
    return { count, size };
  }, [effectiveSelected, previewData]);

  const handleRetry = () => {
    setRetryingStep("retrying");
    retryTask.mutate(
      { taskId, selectedFiles: [...effectiveSelected] },
      {
        onSuccess: () => {
          toast.success("重试任务已创建", {
            description: `仓库 ${repoId} 的重试任务已提交`,
          });
          onRetrySuccess?.();
          handleClose();
        },
        onError: (error) => {
          toast.error("重试失败", {
            description: error instanceof Error ? error.message : "请稍后重试",
          });
          setRetryingStep("preview");
        },
      },
    );
  };

  const handleClose = () => {
    setRetryingStep("preview");
    setSelectedFiles(new Set());
    retryTask.reset();
    onOpenChange(false);
  };

  const isStep = previewQuery.isLoading ? "loading" : retryingStep;
  const isRetrying = retryingStep === "retrying";
  const allCached = previewData?.all_required_cached ?? false;
  const nonCachedCount = (previewData?.items ?? []).filter(
    (item) => item.type === "file" && !item.is_cached,
  ).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="min-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-lg flex items-center gap-2">
            <RotateCcw className="size-5 text-muted-foreground" />
            重试任务 #{taskId}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            仓库: <span className="font-medium text-foreground">{repoId}</span>
            {revision && (
              <>
                <span className="mx-1.5 text-border">·</span>
                版本: <span className="font-mono text-xs">{revision}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          <AnimatePresence mode="wait">
            {isStep === "loading" ? (
              <motion.div
                key="loading"
                variants={contentVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.25 }}
                className="h-full flex items-center justify-center py-16"
              >
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    正在检查文件缓存状态...
                  </p>
                </div>
              </motion.div>
            ) : previewError ? (
              <motion.div
                key="error"
                variants={contentVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.25 }}
                className="h-full flex flex-col items-center justify-center py-16 px-6"
              >
                <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                  <AlertTriangle className="size-8 text-destructive" />
                </div>
                <h3 className="text-lg font-semibold mb-2">获取重试预览失败</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  {previewError}
                </p>
              </motion.div>
            ) : allCached ? (
              <motion.div
                key="all-cached"
                variants={contentVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.25 }}
                className="h-full flex flex-col"
              >
                <div className="flex flex-col items-center justify-center py-12 px-6">
                  <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    className="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center mb-4"
                  >
                    <CheckCircle2 className="w-10 h-10 text-blue-500" />
                  </motion.div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    所有文件已缓存
                  </h3>
                  <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                    仓库{" "}
                    <span className="font-medium text-foreground">
                      {repoId}
                    </span>{" "}
                    的所有 {previewData?.required_file_count ?? 0}{" "}
                    个文件已在本地缓存中，无需重新下载。
                  </p>
                  {previewData?.cached_commit_hash && (
                    <code className="font-mono text-xs bg-muted/60 px-3 py-1.5 rounded text-muted-foreground">
                      Commit: {previewData.cached_commit_hash}
                    </code>
                  )}
                </div>
              </motion.div>
            ) : previewData ? (
              <motion.div
                key="preview"
                variants={contentVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.25 }}
                className="h-full flex flex-col"
              >
                <ScrollArea className="flex-1 min-h-0">
                  {/* Summary banner — amber accent for "attention / action required" */}
                  <div className="px-6 pt-5 pb-4">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="relative overflow-hidden rounded-xl bg-linear-to-br from-amber-500/10 via-amber-500/5 to-transparent dark:from-amber-500/20 dark:via-amber-500/10 border border-amber-500/20 dark:border-amber-500/30"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                      <div className="absolute bottom-0 left-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />

                      <div className="relative p-5">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-xl bg-amber-500/20 dark:bg-amber-500/30 flex items-center justify-center shrink-0">
                            <RotateCcw className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base font-semibold text-amber-900 dark:text-amber-100 mb-1">
                              选择要重试的文件
                            </h3>
                            <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mb-2.5">
                              已缓存的文件无需重新下载，您可以只选择未缓存的文件进行重试。
                            </p>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-amber-700 dark:text-amber-300">
                              <span className="flex items-center gap-1.5">
                                <span className="font-medium">
                                  {selectedStats.count}
                                </span>
                                <span className="text-amber-600/70 dark:text-amber-400/70">
                                  / {nonCachedCount} 个文件待下载
                                </span>
                              </span>
                              <span className="text-amber-400 dark:text-amber-500">
                                ·
                              </span>
                              <span className="flex items-center gap-1.5">
                                <span className="font-medium">
                                  {formatBytes(selectedStats.size)}
                                </span>
                                <span className="text-amber-600/70 dark:text-amber-400/70">
                                  所需空间
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </div>

                  {/* Commit hash — only when resolved */}
                  {previewData.commit_hash && (
                    <div className="px-6 pb-4">
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span className="text-muted-foreground">Commit:</span>
                        <code className="font-mono bg-muted/60 px-2 py-1 rounded text-foreground/80">
                          {previewData.commit_hash}
                        </code>
                      </motion.div>
                    </div>
                  )}

                  {/* File tree */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="px-6 pb-5"
                  >
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                      文件列表
                    </div>
                    <FileTreeSelector
                      items={previewData.items}
                      repoId={repoId}
                      selectedPaths={effectiveSelected}
                      onSelectionChange={setSelectedFiles}
                    />
                  </motion.div>
                </ScrollArea>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isRetrying}>
            取消
          </Button>
          {isStep === "loading" ? (
            <Button disabled>
              <Loader2 className="mr-2 size-4 animate-spin" />
              检查中...
            </Button>
          ) : previewError || allCached ? (
            <Button onClick={handleClose}>关闭</Button>
          ) : (
            <Button
              onClick={handleRetry}
              disabled={isRetrying || effectiveSelected.size === 0}
              className="gap-1"
            >
              {isRetrying ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  重试中...
                </>
              ) : (
                <>
                  <Check className="size-4" />
                  确认重试 ({effectiveSelected.size} 个文件)
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}