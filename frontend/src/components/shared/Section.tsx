import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

interface SectionProps extends ComponentProps<'section'> {
  container?: boolean
}

export function Section({ className, container = true, children, ...props }: SectionProps) {
  return (
    <section
      className={cn(
        'py-16 md:py-24',
        container && 'container mx-auto px-4',
        className
      )}
      {...props}
    >
      {children}
    </section>
  )
}
