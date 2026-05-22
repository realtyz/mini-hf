import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'

interface PreviewLoadingStateProps {
  status: string
}

const contentVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
}

const STATUS_LABELS: Record<string, string> = {
  pending: '等待中...',
  fetching: '获取仓库信息...',
  processing: '处理文件中...',
  completed: '完成',
  failed: '失败',
}

export function PreviewLoadingState({ status }: PreviewLoadingStateProps) {
  return (
    <motion.div
      key="previewing"
      variants={contentVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center py-12 px-6"
    >
      <Loader2 className="size-10 animate-spin text-primary mb-4" />
      <div className="text-center space-y-2">
        <motion.p
          key={status}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm font-medium text-foreground"
        >
          {STATUS_LABELS[status] ?? status}
        </motion.p>
      </div>
      <p className="text-xs text-muted-foreground mt-4 max-w-sm text-center">
        正在获取仓库文件列表，大型仓库可能需要一些时间...
      </p>
    </motion.div>
  )
}
