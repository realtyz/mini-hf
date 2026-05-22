import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, CheckCircle2 } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SelectableFileTree } from '../SelectableFileTree'
import { formatBytes } from '@/lib/utils'
import type { TaskPreviewData } from '@/lib/api-types'

interface PreviewResultStepProps {
  previewData: TaskPreviewData
  selectedFiles: Set<string>
  onSelectionChange: (files: Set<string>) => void
  createError: string | null
}

const contentVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
}

export function PreviewResultStep({ previewData, selectedFiles, onSelectionChange, createError }: PreviewResultStepProps) {
  const selectedStats = useMemo(() => {
    let count = 0, size = 0
    for (const item of previewData.items ?? []) {
      if (item.type === 'file' && selectedFiles.has(item.path)) {
        count++
        size += item.size
      }
    }
    return { count, size }
  }, [selectedFiles, previewData])

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
            className="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center mb-4"
          >
            <CheckCircle2 className="w-10 h-10 text-blue-500" />
          </motion.div>
          <h3 className="text-lg font-semibold text-foreground mb-2">所有文件已缓存</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
            仓库 <span className="font-medium text-foreground">{previewData.repo_id}</span> 的所有 {previewData.total_file_count} 个文件已在本地缓存中，无需重复下载。
          </p>
          {previewData.cached_commit_hash && (
            <code className="font-mono text-xs bg-muted/60 px-3 py-1.5 rounded text-muted-foreground">
              Commit: {previewData.cached_commit_hash}
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
    )
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
        {/* Summary info card */}
        <div className="px-6 pt-5 pb-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative overflow-hidden rounded-xl bg-linear-to-br from-emerald-500/10 via-emerald-500/5 to-transparent dark:from-emerald-500/20 dark:via-emerald-500/10 border border-emerald-500/20 dark:border-emerald-500/30"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />

            <div className="relative p-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 dark:bg-emerald-500/30 flex items-center justify-center shrink-0">
                  <Check className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-emerald-900 dark:text-emerald-100 mb-1">
                    预览完成
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-emerald-700 dark:text-emerald-300">
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium">{selectedStats.count}</span>
                      <span className="text-emerald-600/70 dark:text-emerald-400/70">个文件已选</span>
                    </span>
                    <span className="text-emerald-400 dark:text-emerald-500">·</span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-medium">{formatBytes(selectedStats.size)}</span>
                      <span className="text-emerald-600/70 dark:text-emerald-400/70">所需空间</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Repo details */}
        <div className="px-6 pb-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              仓库信息
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="group relative p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="text-xs text-muted-foreground mb-1">仓库</div>
                <p className="font-medium text-sm truncate">{previewData.repo_id}</p>
              </div>
              <div className="group relative p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="text-xs text-muted-foreground mb-1">版本</div>
                <p className="font-mono text-sm">{previewData.revision}</p>
              </div>
              <div className="group relative p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="text-xs text-muted-foreground mb-1">文件数</div>
                <p className="text-sm">
                  <span className="font-medium text-primary">{selectedStats.count}</span>
                  <span className="text-muted-foreground"> / {previewData.total_file_count}</span>
                </p>
              </div>
              <div className="group relative p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="text-xs text-muted-foreground mb-1">大小</div>
                <p className="text-sm">
                  <span className="font-medium text-primary">{formatBytes(selectedStats.size)}</span>
                  <span className="text-muted-foreground"> / {formatBytes(previewData.total_storage)}</span>
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Commit hash */}
        {previewData.commit_hash && (
          <div className="px-6 pb-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
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
        <div className="px-6 pb-5">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            文件列表
          </div>
          <SelectableFileTree
            items={previewData.items}
            repoId={previewData.repo_id}
            selectedPaths={selectedFiles}
            onSelectionChange={onSelectionChange}
          />
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
  )
}
