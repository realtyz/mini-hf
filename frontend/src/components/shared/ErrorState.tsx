import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'

interface ErrorStateProps {
  message?: string
  description?: string
  onRetry?: () => void
  retryLabel?: string
}

export function ErrorState({ message = '加载失败', description, onRetry, retryLabel = '重试' }: ErrorStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex h-64 items-center justify-center"
    >
      <div className="text-center">
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3 }}
          className="text-destructive mb-3"
        >
          <AlertCircle className="size-10 mx-auto" />
        </motion.div>
        <p className="text-sm text-muted-foreground">{message}</p>
        {description && (
          <p className="text-xs text-muted-foreground/70 mt-1">{description}</p>
        )}
        {onRetry && (
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
              {retryLabel}
            </Button>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
