import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, CheckCircle2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SectionLabel } from "@/components/shared";
import { FileTreeSelector } from "../FileTreeSelector";
import { formatBytes } from "@/lib/utils";
import type { TaskPreviewData } from "@/lib/api/types";

interface PreviewResultStepProps {
  previewData: TaskPreviewData;
  selectedFiles: Set<string>;
  onSelectionChange: (files: Set<string>) => void;
  createError: string | null;
}

const contentVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

export function PreviewResultStep({
  previewData,
  selectedFiles,
  onSelectionChange,
  createError,
}: PreviewResultStepProps) {
  const selectedStats = useMemo(() => {
    let count = 0,
      size = 0;
    for (const item of previewData.items ?? []) {
      if (item.type === "file" && selectedFiles.has(item.path)) {
        count++;
        size += item.size;
      }
    }
    return { count, size };
  }, [selectedFiles, previewData]);

  if (previewData.all_required_cached) {
    return (
      <motion.div
        key="preview"
        variants={contentVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.3 }}
        className="h-full flex flex-col"
      >
        <div className="flex flex-col items-center justify-center py-12 px-6">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4"
          >
            <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </motion.div>
          <h3 className="text-base font-semibold text-foreground mb-1.5">
            所有文件已缓存
          </h3>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
            仓库{" "}
            <span className="font-medium text-foreground">
              {previewData.repo_id}
            </span>{" "}
            的所有 {previewData.total_file_count} 个文件已在本地缓存中，无需重复下载。
          </p>
          {previewData.cached_commit_hash && (
            <code className="font-mono text-xs bg-muted/60 px-2.5 py-1 rounded text-muted-foreground">
              {previewData.cached_commit_hash}
            </code>
          )}
        </div>

        <AnimatePresence>
          {createError && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="px-6 py-3 border-t"
            >
              <Alert variant="destructive">
                <AlertDescription>{createError}</AlertDescription>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  return (
    <motion.div
      key="preview"
      variants={contentVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.3 }}
      className="h-full flex flex-col"
    >
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-5 px-6 pt-5 pb-5">
          {/* 预览完成 — flat summary strip */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
              <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
            </span>
            <div className="flex flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
              <span className="text-sm font-medium text-foreground">
                预览完成
              </span>
              <span className="text-xs text-muted-foreground">
                已选{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {selectedStats.count}
                </span>{" "}
                个文件 · 预计{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {formatBytes(selectedStats.size)}
                </span>
              </span>
            </div>
          </motion.div>

          {/* 仓库信息 */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-3"
          >
            <SectionLabel>仓库信息</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-muted/30 px-3 py-2.5 min-w-0">
                <div className="text-[11px] text-muted-foreground/70">仓库</div>
                <p className="mt-0.5 truncate text-sm font-medium">
                  {previewData.repo_id}
                </p>
              </div>
              <div className="rounded-lg bg-muted/30 px-3 py-2.5 min-w-0">
                <div className="text-[11px] text-muted-foreground/70">版本</div>
                <p className="mt-0.5 truncate font-mono text-sm">
                  {previewData.revision}
                </p>
              </div>
              <div className="rounded-lg bg-muted/30 px-3 py-2.5">
                <div className="text-[11px] text-muted-foreground/70">
                  文件数
                </div>
                <p className="mt-0.5 text-sm tabular-nums">
                  <span className="font-medium text-primary">
                    {selectedStats.count}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    / {previewData.total_file_count}
                  </span>
                </p>
              </div>
              <div className="rounded-lg bg-muted/30 px-3 py-2.5">
                <div className="text-[11px] text-muted-foreground/70">大小</div>
                <p className="mt-0.5 text-sm tabular-nums">
                  <span className="font-medium text-primary">
                    {formatBytes(selectedStats.size)}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    / {formatBytes(previewData.total_storage)}
                  </span>
                </p>
              </div>
            </div>
            {previewData.commit_hash && (
              <div className="flex items-center gap-2 text-xs pt-0.5">
                <span className="text-muted-foreground/70">Commit</span>
                <code className="font-mono bg-muted/60 px-2 py-0.5 rounded text-foreground/80">
                  {previewData.commit_hash}
                </code>
              </div>
            )}
          </motion.div>

          {/* 文件列表 */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="space-y-3"
          >
            <SectionLabel>文件列表</SectionLabel>
            <FileTreeSelector
              items={previewData.items}
              repoId={previewData.repo_id}
              selectedPaths={selectedFiles}
              onSelectionChange={onSelectionChange}
            />
          </motion.div>
        </div>
      </ScrollArea>

      <AnimatePresence>
        {createError && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="px-6 py-3 border-t"
          >
            <Alert variant="destructive">
              <AlertDescription>{createError}</AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
