import { useState } from 'react'
import { CheckCircle2, Loader2, RotateCcw, Save } from 'lucide-react'
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { smoothTransition, prefersReducedMotion } from '@/lib/animations/motion-config'
import { SpotlightCard } from '@/components/shared/SpotlightCard'

// ═══════════════════════════════════════════════════════════════════════════════
// Form Field — polished input with focus ring and animated feedback
// ═══════════════════════════════════════════════════════════════════════════════

interface FormFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  helperText?: string
  error?: string
  icon?: React.ReactNode
  className?: string
}

export function FormField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  helperText,
  error,
  icon,
  className,
}: FormFieldProps) {
  const [isFocused, setIsFocused] = useState(false)

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label
        htmlFor={id}
        className={cn(
          'text-sm font-medium transition-colors duration-150',
          error ? 'text-destructive' : isFocused ? 'text-primary' : 'text-foreground/80'
        )}
      >
        {label}
      </Label>
      <div className="relative">
        {icon && (
          <div
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-150 pointer-events-none',
              error ? 'text-destructive/70' : isFocused ? 'text-primary/70' : 'text-muted-foreground/50'
            )}
          >
            {icon}
          </div>
        )}
        <Input
          id={id}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={cn(
            icon && 'pl-10',
            'transition-all duration-200',
            error
              ? 'border-destructive/50 focus-visible:ring-destructive/20'
              : 'focus-visible:ring-primary/20'
          )}
        />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {error ? (
          <motion.p
            key="error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-xs text-destructive"
          >
            {error}
          </motion.p>
        ) : helperText ? (
          <motion.p
            key="helper"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-xs text-muted-foreground"
          >
            {helperText}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Settings Section — consistent card wrapper with header/footer
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// Section Header — lightweight divider with optional icon
// ═══════════════════════════════════════════════════════════════════════════════

export function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2.5 pb-2.5 mb-2 border-b border-border/30">
      <span className="text-muted-foreground/70">{icon}</span>
      <h3 className="text-sm font-semibold text-foreground/80">{title}</h3>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Toggle Item — compact row with switch
// ═══════════════════════════════════════════════════════════════════════════════

interface ToggleItemProps {
  id: string
  title: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  icon?: React.ReactNode
}

export function ToggleItem({
  id,
  title,
  description,
  checked,
  onCheckedChange,
  icon,
}: ToggleItemProps) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 rounded-lg border p-3.5 transition-all duration-200',
        'hover:border-border',
        checked
          ? 'border-primary/20 bg-primary/3'
          : 'border-border/40 bg-transparent'
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <div
            className={cn(
              'mt-0.5 shrink-0 transition-colors duration-200',
              checked ? 'text-primary' : 'text-muted-foreground/60'
            )}
          >
            {icon}
          </div>
        )}
        <div className="space-y-0.5 min-w-0">
          <Label htmlFor={id} className="text-sm font-medium cursor-pointer">
            {title}
          </Label>
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="mt-0.5 shrink-0"
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Change Status — save-state indicator
// ═══════════════════════════════════════════════════════════════════════════════

export function ChangeStatus({ hasChanges }: { hasChanges: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {hasChanges ? (
        <>
          <span className="relative flex size-2">
            <span className="animate-ping absolute inline-flex size-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full size-2 bg-amber-500" />
          </span>
          <span className="text-muted-foreground text-xs">有未保存的更改</span>
        </>
      ) : (
        <>
          <CheckCircle2 className="size-4 text-emerald-500" />
          <span className="text-muted-foreground text-xs">所有更改已保存</span>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Actions Footer — save / reset bar
// ═══════════════════════════════════════════════════════════════════════════════

export function ActionsFooter({
  hasChanges,
  isSaving,
  onSave,
  onReset,
  extra,
}: {
  hasChanges: boolean
  isSaving: boolean
  onSave: () => void
  onReset: () => void
  extra?: React.ReactNode
}) {
  return (
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <ChangeStatus hasChanges={hasChanges} />
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {extra}
        {hasChanges && (
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            disabled={isSaving}
            className="gap-1.5 h-9"
          >
            <RotateCcw className="size-3.5" />
            重置
          </Button>
        )}
        <Button
          size="sm"
          onClick={onSave}
          disabled={!hasChanges || isSaving}
          className="gap-1.5 h-9"
        >
          {isSaving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          保存更改
        </Button>
      </div>
    </div>
  )
}

export { Skeleton }
