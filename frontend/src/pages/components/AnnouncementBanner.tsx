import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Info, AlertTriangle, AlertCircle } from 'lucide-react'
import { usePublicAnnouncement } from '@/hooks/api'
import type { AnnouncementType } from '@/lib/api-types'

const ANNOUNCEMENT_DISMISSED_KEY = 'announcement_dismissed'

interface AnnouncementBannerProps {
  className?: string
}

const typeConfig: Record<AnnouncementType, {
  icon: React.ReactNode
  bgClass: string
  textClass: string
  borderClass: string
}> = {
  info: {
    icon: <Info className="h-5 w-5" />,
    bgClass: 'bg-sky-50 dark:bg-sky-950/80',
    textClass: 'text-sky-800 dark:text-sky-200',
    borderClass: 'border-sky-200 dark:border-sky-800',
  },
  warning: {
    icon: <AlertTriangle className="h-5 w-5" />,
    bgClass: 'bg-amber-50 dark:bg-amber-950/80',
    textClass: 'text-amber-800 dark:text-amber-200',
    borderClass: 'border-amber-200 dark:border-amber-800',
  },
  urgent: {
    icon: <AlertCircle className="h-5 w-5" />,
    bgClass: 'bg-red-50 dark:bg-red-950/80',
    textClass: 'text-red-800 dark:text-red-200',
    borderClass: 'border-red-200 dark:border-red-800',
  },
}

export function AnnouncementBanner({ className }: AnnouncementBannerProps) {
  const { data, isLoading } = usePublicAnnouncement()
  const [isVisible, setIsVisible] = useState(false)
  const [isDismissed, setIsDismissed] = useState<boolean | null>(null) // null = not yet checked

  useEffect(() => {
    // Check if user has dismissed this announcement
    const dismissedContent = localStorage.getItem(ANNOUNCEMENT_DISMISSED_KEY)
    if (dismissedContent && dismissedContent === data?.data?.content) {
      setIsDismissed(true)
    } else {
      setIsDismissed(false)
    }
  }, [data?.data?.content])

  useEffect(() => {
    // Show banner if announcement is active and not dismissed
    // Wait until we've checked localStorage (isDismissed is not null)
    if (isDismissed === null) return
    if (data?.data?.is_active && data?.data?.content && !isDismissed) {
      setIsVisible(true)
    } else {
      setIsVisible(false)
    }
  }, [data?.data?.is_active, data?.data?.content, isDismissed])

  const handleDismiss = () => {
    setIsVisible(false)
    // Remember dismissed content so we don't show it again until it changes
    if (data?.data?.content) {
      localStorage.setItem(ANNOUNCEMENT_DISMISSED_KEY, data.data.content)
    }
    setIsDismissed(true)
  }

  // Don't render if loading, no data, or not visible
  if (isLoading || !data?.data?.content || !isVisible) {
    return null
  }

  const announcement = data.data
  const config = typeConfig[announcement.announcement_type] || typeConfig.info

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className={className}
        >
          <div
            className={`
              ${config.bgClass} ${config.textClass} ${config.borderClass}
              border-b backdrop-blur-sm
            `}
          >
            <div className="container mx-auto px-4">
              <div className="flex items-center justify-between gap-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className="shrink-0"
                  >
                    {config.icon}
                  </motion.div>
                  <p className="text-sm font-medium truncate">
                    {announcement.content}
                  </p>
                </div>
                <button
                  onClick={handleDismiss}
                  className={`
                    shrink-0 p-1.5 rounded-lg
                    hover:bg-black/10 dark:hover:bg-white/10
                    transition-colors duration-200
                  `}
                  aria-label="关闭公告"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default AnnouncementBanner
