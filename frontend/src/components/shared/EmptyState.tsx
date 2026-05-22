import type { ReactNode } from 'react'
import { Inbox, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'

interface EmptyStateProps {
  icon?: ReactNode
  message?: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  children?: ReactNode
}

export function EmptyState({
  icon,
  message = '暂无数据',
  description,
  actionLabel,
  onAction,
  children,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className="flex h-64 items-center justify-center"
    >
      <div className="text-center">
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl bg-muted p-5 mb-4 mx-auto w-fit"
        >
          {icon ?? <Inbox className="size-8 text-muted-foreground" />}
        </motion.div>
        <motion.p
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="text-sm font-medium"
        >
          {message}
        </motion.p>
        {description && (
          <motion.p
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-sm text-muted-foreground mt-1"
          >
            {description}
          </motion.p>
        )}
        {actionLabel && onAction && (
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button size="sm" variant="outline" className="mt-4" onClick={onAction}>
              <Plus className="mr-1.5 size-3.5" />
              {actionLabel}
            </Button>
          </motion.div>
        )}
        {children}
      </div>
    </motion.div>
  )
}
