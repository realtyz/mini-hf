import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import { SpotlightCard } from '@/components/shared/SpotlightCard'
import { motion } from 'framer-motion'
import { smoothTransition, prefersReducedMotion } from '@/lib/animations/motion-config'

interface SettingsSectionProps {
  icon?: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  delay?: number
}

export function SettingsSection({
  icon,
  title,
  description,
  children,
  footer,
  className,
  delay = 0,
}: SettingsSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...smoothTransition, delay }}
    >
      <SpotlightCard variant="static" className={className}>
        <CardHeader className="pb-3 pt-5 px-5 sm:px-6">
          <div className="flex items-start gap-3">
            {icon && (
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
                {icon}
              </div>
            )}
            <div className="flex-1 space-y-0.5 pt-0.5">
              <CardTitle className="text-base font-semibold tracking-tight">{title}</CardTitle>
              <CardDescription className="text-[13px] leading-relaxed">{description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-5 sm:px-6 pb-5">{children}</CardContent>
        {footer && (
          <CardFooter className="border-t border-border/40 bg-muted/30 px-5 sm:px-6 py-3.5 rounded-b-xl">
            {footer}
          </CardFooter>
        )}
      </SpotlightCard>
    </motion.div>
  )
}
