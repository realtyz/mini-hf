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
import { smoothTransition, prefersReducedMotion } from './motion-config'

// ═══════════════════════════════════════════════════════════════════════════════
// Spotlight Card
// ═══════════════════════════════════════════════════════════════════════════════

export function SpotlightCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border/60 bg-card shadow-sm',
        className
      )}
    >
      {children}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Form Field
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
    <div className={cn('space-y-2', className)}>
      <Label
        htmlFor={id}
        className={cn(
          'text-sm font-medium transition-colors duration-150',
          isFocused && 'text-primary'
        )}
      >
        {label}
      </Label>
      <div className="relative">
        {icon && (
          <div
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-150 pointer-events-none',
              isFocused ? 'text-primary' : 'text-muted-foreground'
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
            error && 'border-red-500 focus-visible:ring-red-500',
            !error && isFocused && 'border-primary/50'
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
            className="text-xs text-red-500"
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
// Settings Section
// ═══════════════════════════════════════════════════════════════════════════════

interface SettingsSectionProps {
  icon: React.ReactNode
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
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...smoothTransition, delay }}
    >
      <SpotlightCard className={className}>
        <CardHeader className="pt-6 pb-4">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
              {icon}
            </div>
            <div className="flex-1 space-y-1 pt-0.5">
              <CardTitle className="text-lg font-semibold tracking-tight">{title}</CardTitle>
              <CardDescription className="text-[13px] leading-relaxed">{description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-1 pb-6">{children}</CardContent>
        {footer && (
          <CardFooter className="border-t border-border/50 bg-muted/20 px-6 py-4 rounded-b-2xl">
            {footer}
          </CardFooter>
        )}
      </SpotlightCard>
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section Header
// ═══════════════════════════════════════════════════════════════════════════════

export function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2.5 pb-3 mb-1 border-b border-border/40">
      <span className="text-muted-foreground">{icon}</span>
      <h3 className="text-sm font-semibold tracking-tight text-foreground/85">{title}</h3>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Toggle Item
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
        'flex items-start justify-between gap-4 rounded-xl border p-4 transition-all duration-200',
        'hover:border-primary/20',
        checked && 'border-primary/15 bg-primary/3'
      )}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <div
            className={cn(
              'mt-0.5 transition-colors duration-200',
              checked ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            {icon}
          </div>
        )}
        <div className="space-y-0.5">
          <Label htmlFor={id} className="text-sm font-medium cursor-pointer">
            {title}
          </Label>
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5" />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Unsaved Changes Badge
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
          <span className="text-muted-foreground">有未保存的更改</span>
        </>
      ) : (
        <>
          <CheckCircle2 className="size-4 text-emerald-500" />
          <span className="text-muted-foreground">所有更改已保存</span>
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Actions Footer — consistent save/reset buttons for config sections
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
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {extra}
        {hasChanges && (
          <Button variant="outline" onClick={onReset} disabled={isSaving} className="gap-2">
            <RotateCcw className="size-4" />
            重置
          </Button>
        )}
        <Button onClick={onSave} disabled={!hasChanges || isSaving} className="gap-2 min-w-25">
          {isSaving && <Loader2 className="size-4 animate-spin" />}
          {!isSaving && <Save className="size-4" />}
          保存更改
        </Button>
      </div>
    </div>
  )
}

export { Skeleton }
