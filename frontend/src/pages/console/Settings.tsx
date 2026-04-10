import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Bell,
  Shield,
  Mail,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Save,
  RotateCcw,
  Server,
  Sparkles,
  Plug,
  SettingsIcon,
  Globe,
  Plus,
  Trash2,
  Info,
  AlertTriangle,
} from 'lucide-react'
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useSMTPConfig,
  useBatchUpdateConfigs,
  useInitializeDefaultConfigs,
  useTestSMTPConnection,
  useSaveSMTPConfig,
  useHFEndpointConfig,
  useSaveHFEndpointConfig,
  useNotificationConfig,
  useSaveNotificationConfig,
  useAnnouncementConfig,
  useSaveAnnouncementConfig,
} from '@/hooks/api'
import { toast } from 'sonner'
import type { SMTPTestRequest, SMTPSaveRequest, HFEndpointSaveRequest } from '@/lib/api-types'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

// ═══════════════════════════════════════════════════════════════════════════════
// Animation & Motion Config
// ═══════════════════════════════════════════════════════════════════════════════

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const springConfig = { type: 'spring' as const, stiffness: 300, damping: 30 }
const smoothTransition = { duration: prefersReducedMotion ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] as const }

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: prefersReducedMotion ? 0 : 0.06,
      delayChildren: prefersReducedMotion ? 0 : 0.08,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 120, damping: 22 },
  },
}

const panelVariants = {
  hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 12, scale: prefersReducedMotion ? 1 : 0.995 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: prefersReducedMotion ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] as const },
  },
  exit: {
    opacity: 0,
    y: prefersReducedMotion ? 0 : -8,
    scale: prefersReducedMotion ? 1 : 0.995,
    transition: { duration: prefersReducedMotion ? 0 : 0.2 },
  },
}

type SettingsTab = 'smtp' | 'notification' | 'huggingface'

interface SMTPFormData {
  host: string
  port: string
  username: string
  password: string
  use_tls: boolean
  from_email: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// Spotlight Card Effect
// ═══════════════════════════════════════════════════════════════════════════════

function SpotlightCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-sm',
        'transition-shadow duration-300',
        isHovered && 'shadow-md',
        className
      )}
      style={{
        background: isHovered
          ? `radial-gradient(600px circle at ${position.x}px ${position.y}px, hsl(var(--primary) / 0.06), transparent 40%)`
          : undefined,
      }}
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

function FormField({
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
          'text-sm font-medium transition-colors',
          isFocused && 'text-primary'
        )}
      >
        {label}
      </Label>
      <div className="relative">
        {icon && (
          <motion.div
            className={cn(
              'absolute left-3 top-1/2 -translate-y-1/2 transition-colors pointer-events-none',
              isFocused ? 'text-primary' : 'text-muted-foreground'
            )}
            animate={{ scale: isFocused ? 1.08 : 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            {icon}
          </motion.div>
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

function SettingsSection({
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
      <SpotlightCard className={cn('backdrop-blur-sm', className)}>
        <CardHeader className="pt-6 pb-4 bg-linear-to-b from-muted/40 to-transparent">
          <div className="flex items-start gap-4">
            <motion.div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm"
              whileHover={{ scale: 1.05, rotate: 3 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              {icon}
            </motion.div>
            <div className="flex-1 space-y-1">
              <CardTitle className="text-lg tracking-tight">{title}</CardTitle>
              <CardDescription className="text-sm">{description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2 pb-6">{children}</CardContent>
        {footer && (
          <CardFooter className="border-t border-border/60 bg-muted/30 px-6 py-4">
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

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 pb-3 mb-1 border-b border-border/60">
      <span className="text-muted-foreground">{icon}</span>
      <h3 className="text-sm font-semibold tracking-tight text-foreground/90">{title}</h3>
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

function ToggleItem({
  id,
  title,
  description,
  checked,
  onCheckedChange,
  icon,
}: ToggleItemProps) {
  return (
    <motion.div
      className={cn(
        'flex items-start justify-between gap-4 rounded-xl border p-4 transition-all duration-200',
        'hover:border-primary/30 hover:shadow-sm',
        checked && 'border-primary/20 bg-primary/3'
      )}
      whileHover={{ scale: prefersReducedMotion ? 1 : 1.003 }}
      whileTap={{ scale: prefersReducedMotion ? 1 : 0.997 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <motion.div
            className={cn(
              'mt-0.5 transition-colors duration-200',
              checked ? 'text-primary' : 'text-muted-foreground'
            )}
            animate={{ scale: checked ? 1.1 : 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            {icon}
          </motion.div>
        )}
        <div className="space-y-0.5">
          <Label htmlFor={id} className="text-sm font-medium cursor-pointer">
            {title}
          </Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Unsaved Changes Badge
// ═══════════════════════════════════════════════════════════════════════════════

function ChangeStatus({ hasChanges }: { hasChanges: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {hasChanges ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
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
// Endpoint Row
// ═══════════════════════════════════════════════════════════════════════════════

function EndpointRow({
  index,
  value,
  onChange,
  onRemove,
  canRemove,
  isDefault,
  onSetDefault,
}: {
  index: number
  value: string
  onChange: (value: string) => void
  onRemove: () => void
  canRemove: boolean
  isDefault: boolean
  onSetDefault: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={cn(
        'flex items-center gap-3 rounded-xl border p-3 transition-all duration-200',
        isDefault ? 'border-primary/20 bg-primary/3' : 'hover:border-primary/20 hover:bg-muted/20'
      )}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
        {index + 1}
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://huggingface.co"
        className="flex-1"
      />
      <div className="flex items-center gap-1.5">
        <Button
          variant={isDefault ? 'default' : 'outline'}
          size="sm"
          onClick={onSetDefault}
          className="h-8 text-xs min-w-18"
        >
          {isDefault ? '默认' : '设为默认'}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={!canRemove}
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </motion.div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Loading Skeleton
// ═══════════════════════════════════════════════════════════════════════════════

function SettingsSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-36" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
        <Skeleton className="h-7 w-28" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="hidden flex-col gap-2 lg:flex">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-80 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Settings Component
// ═══════════════════════════════════════════════════════════════════════════════

export function Settings() {
  const { data: smtpConfigData, isLoading: isSMTPLoading, error: smtpError } = useSMTPConfig()
  const batchUpdate = useBatchUpdateConfigs()
  const initializeDefaults = useInitializeDefaultConfigs()
  const testSMTP = useTestSMTPConnection()
  const saveSMTP = useSaveSMTPConfig()
  const { data: hfConfigData, isLoading: isHFLoading } = useHFEndpointConfig()
  const saveHFConfig = useSaveHFEndpointConfig()
  const { data: notificationData, isLoading: isNotificationLoading } = useNotificationConfig()
  const saveNotificationConfig = useSaveNotificationConfig()
  const { data: announcementData, isLoading: isAnnouncementLoading } = useAnnouncementConfig()
  const saveAnnouncementConfig = useSaveAnnouncementConfig()

  const [activeTab, setActiveTab] = useState<SettingsTab>('smtp')
  const [smtpForm, setSmtpForm] = useState<SMTPFormData>({
    host: '',
    port: '587',
    username: '',
    password: '',
    use_tls: true,
    from_email: '',
  })
  const [originalForm, setOriginalForm] = useState<SMTPFormData>(smtpForm)
  const [showPassword, setShowPassword] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [validationErrors, setValidationErrors] = useState<Partial<Record<keyof SMTPFormData, string>>>({})

  // HF endpoint settings state
  const [hfEndpoints, setHfEndpoints] = useState<string[]>(['https://huggingface.co'])
  const [hfDefaultEndpoint, setHfDefaultEndpoint] = useState<string>('https://huggingface.co')
  const [originalHfEndpoints, setOriginalHfEndpoints] = useState<string[]>(['https://huggingface.co'])
  const [originalHfDefault, setOriginalHfDefault] = useState<string>('https://huggingface.co')
  const [isHFSaving, setIsHFSaving] = useState(false)

  // Notification settings state
  const [notificationConfig, setNotificationConfig] = useState({
    email: '',
    task_approval_push: true,
    auto_approve_enabled: false,
    auto_approve_threshold_gb: 100,
  })
  const [originalNotificationConfig, setOriginalNotificationConfig] = useState(notificationConfig)
  const [thresholdUnit, setThresholdUnit] = useState<'GB' | 'TB'>('GB')
  const [isNotificationSaving, setIsNotificationSaving] = useState(false)

  // Announcement settings state
  const [announcement, setAnnouncement] = useState('')
  const [announcementType, setAnnouncementType] = useState<'info' | 'warning' | 'urgent'>('info')
  const [announcementActive, setAnnouncementActive] = useState(true)
  const [originalAnnouncement, setOriginalAnnouncement] = useState({
    content: '',
    type: 'info' as 'info' | 'warning' | 'urgent',
    isActive: true,
  })
  const [isAnnouncementSaving, setIsAnnouncementSaving] = useState(false)


  // Initialize form from config data
  useEffect(() => {
    if (smtpConfigData?.data) {
      const data = smtpConfigData.data
      const newForm = {
        host: data.host,
        port: String(data.port) || '587',
        username: data.username,
        password: '',
        use_tls: data.use_tls,
        from_email: data.from_email,
      }

      setSmtpForm(newForm)
      setOriginalForm(newForm)
    }
  }, [smtpConfigData])

  // Initialize HF config from data
  useEffect(() => {
    if (hfConfigData?.data) {
      const data = hfConfigData.data
      setHfEndpoints(data.endpoints)
      setHfDefaultEndpoint(data.default_endpoint)
      setOriginalHfEndpoints(data.endpoints)
      setOriginalHfDefault(data.default_endpoint)
    }
  }, [hfConfigData])

  // Initialize notification config from data
  useEffect(() => {
    if (notificationData?.data) {
      const data = notificationData.data
      const config = {
        email: data.email,
        task_approval_push: data.task_approval_push,
        auto_approve_enabled: data.auto_approve_enabled,
        auto_approve_threshold_gb: data.auto_approve_threshold_gb,
      }
      setNotificationConfig(config)
      setOriginalNotificationConfig(config)
      if (data.auto_approve_threshold_gb >= 1024) {
        setThresholdUnit('TB')
      } else {
        setThresholdUnit('GB')
      }
    }
  }, [notificationData])

  // Initialize announcement from data
  useEffect(() => {
    if (announcementData?.data) {
      const data = announcementData.data
      setAnnouncement(data.content)
      setAnnouncementType(data.announcement_type || 'info')
      setAnnouncementActive(data.is_active ?? true)
      setOriginalAnnouncement({
        content: data.content,
        type: data.announcement_type || 'info',
        isActive: data.is_active ?? true,
      })
    }
  }, [announcementData])

  const handleSmtpChange = useCallback(
    (field: keyof SMTPFormData, value: string | boolean) => {
      setSmtpForm((prev) => ({ ...prev, [field]: value }))
      if (validationErrors[field]) {
        setValidationErrors((prev) => ({ ...prev, [field]: undefined }))
      }
    },
    [validationErrors]
  )

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof SMTPFormData, string>> = {}

    if (!smtpForm.host.trim()) {
      errors.host = '请输入 SMTP 服务器地址'
    }
    if (!smtpForm.port.trim()) {
      errors.port = '请输入端口号'
    } else if (!/^\d+$/.test(smtpForm.port)) {
      errors.port = '端口号必须为数字'
    }
    if (!smtpForm.username.trim()) {
      errors.username = '请输入用户名'
    }
    if (!smtpForm.from_email.trim()) {
      errors.from_email = '请输入发件人邮箱'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(smtpForm.from_email)) {
      errors.from_email = '请输入有效的邮箱地址'
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const hasChanges = JSON.stringify(smtpForm) !== JSON.stringify(originalForm)

  const handleTestConnection = async () => {
    if (!smtpForm.host.trim() || !smtpForm.username.trim() || !smtpForm.password.trim()) {
      toast.error('请填写 SMTP 服务器地址、用户名和密码后再测试')
      return
    }

    setIsTesting(true)
    setTestResult(null)
    try {
      const testData: SMTPTestRequest = {
        host: smtpForm.host,
        port: parseInt(smtpForm.port, 10) || 587,
        username: smtpForm.username,
        password: smtpForm.password,
        use_tls: smtpForm.use_tls,
        from_email: smtpForm.from_email || smtpForm.username,
      }

      const response = await testSMTP.mutateAsync(testData)
      setTestResult({
        success: response.data,
        message: response.test_message,
      })

      if (response.data) {
        toast.success('SMTP 连接测试成功')
      } else {
        toast.error('SMTP 连接测试失败')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '连接测试失败'
      setTestResult({ success: false, message: errorMessage })
      toast.error(`测试失败: ${errorMessage}`)
    } finally {
      setIsTesting(false)
    }
  }

  const handleSaveSmtp = async () => {
    if (!validateForm()) {
      toast.error('请检查表单填写是否正确')
      return
    }

    setIsSaving(true)
    try {
      if (!smtpForm.password) {
        const configs = [
          { key: 'smtp_host', value: smtpForm.host, category: 'email' },
          { key: 'smtp_port', value: smtpForm.port, category: 'email' },
          { key: 'smtp_username', value: smtpForm.username, category: 'email' },
          { key: 'smtp_use_tls', value: String(smtpForm.use_tls), category: 'email' },
          { key: 'smtp_from_email', value: smtpForm.from_email, category: 'email' },
        ]
        await batchUpdate.mutateAsync({ configs })
      } else {
        const saveData: SMTPSaveRequest = {
          host: smtpForm.host,
          port: parseInt(smtpForm.port, 10) || 587,
          username: smtpForm.username,
          password: smtpForm.password,
          use_tls: smtpForm.use_tls,
          from_email: smtpForm.from_email,
          test_before_save: true,
        }
        await saveSMTP.mutateAsync(saveData)
      }

      toast.success('SMTP 配置已保存')
      setTestResult(null)
      setOriginalForm({ ...smtpForm, password: '' })
      setSmtpForm((prev) => ({ ...prev, password: '' }))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '保存失败'
      toast.error(errorMessage)
      console.error('Failed to save SMTP config:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setSmtpForm(originalForm)
    setValidationErrors({})
    toast.info('已重置为上次保存的配置')
  }

  const hasHFChanges =
    JSON.stringify(hfEndpoints) !== JSON.stringify(originalHfEndpoints) ||
    hfDefaultEndpoint !== originalHfDefault

  const handleAddHFEndpoint = () => {
    setHfEndpoints((prev) => [...prev, ''])
  }

  const handleRemoveHFEndpoint = (index: number) => {
    setHfEndpoints((prev) => {
      const next = prev.filter((_, i) => i !== index)
      if (hfDefaultEndpoint === prev[index] && next.length > 0) {
        setHfDefaultEndpoint(next[0])
      }
      return next
    })
  }

  const handleUpdateHFEndpoint = (index: number, value: string) => {
    const old = hfEndpoints[index]
    setHfEndpoints((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
    if (hfDefaultEndpoint === old) {
      setHfDefaultEndpoint(value)
    }
  }

  const handleSaveHF = async () => {
    const cleaned = hfEndpoints.map((e) => e.trim()).filter((e) => e)
    if (cleaned.length === 0) {
      toast.error('至少需要一个 endpoint')
      return
    }
    if (!cleaned.includes(hfDefaultEndpoint.trim())) {
      toast.error('默认 endpoint 必须在列表中')
      return
    }
    setIsHFSaving(true)
    try {
      const payload: HFEndpointSaveRequest = {
        endpoints: cleaned,
        default_endpoint: hfDefaultEndpoint.trim(),
      }
      await saveHFConfig.mutateAsync(payload)
      toast.success('HuggingFace 配置已保存')
      setOriginalHfEndpoints(cleaned)
      setOriginalHfDefault(hfDefaultEndpoint.trim())
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败'
      toast.error(msg)
    } finally {
      setIsHFSaving(false)
    }
  }

  const handleResetHF = () => {
    setHfEndpoints(originalHfEndpoints)
    setHfDefaultEndpoint(originalHfDefault)
    toast.info('已重置为上次保存的配置')
  }

  const handleInitializeDefaults = async () => {
    try {
      await initializeDefaults.mutateAsync()
      toast.success('默认配置已初始化')
    } catch (err) {
      toast.error('初始化失败')
      console.error('Failed to initialize defaults:', err)
    }
  }

  const hasNotificationChanges = JSON.stringify(notificationConfig) !== JSON.stringify(originalNotificationConfig)

  const handleSaveNotification = async () => {
    setIsNotificationSaving(true)
    try {
      await saveNotificationConfig.mutateAsync(notificationConfig)
      toast.success('通知配置已保存')
      setOriginalNotificationConfig(notificationConfig)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '保存失败'
      toast.error(errorMessage)
    } finally {
      setIsNotificationSaving(false)
    }
  }

  const handleResetNotification = () => {
    setNotificationConfig(originalNotificationConfig)
    if (originalNotificationConfig.auto_approve_threshold_gb >= 1024) {
      setThresholdUnit('TB')
    } else {
      setThresholdUnit('GB')
    }
    toast.info('已重置为上次保存的配置')
  }

  const hasAnnouncementChanges =
    announcement !== originalAnnouncement.content ||
    announcementType !== originalAnnouncement.type ||
    announcementActive !== originalAnnouncement.isActive

  const handleSaveAnnouncement = async () => {
    setIsAnnouncementSaving(true)
    try {
      await saveAnnouncementConfig.mutateAsync({
        content: announcement,
        announcement_type: announcementType,
        is_active: announcementActive,
      })
      toast.success('公告配置已保存')
      setOriginalAnnouncement({
        content: announcement,
        type: announcementType,
        isActive: announcementActive,
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '保存失败'
      toast.error(errorMessage)
    } finally {
      setIsAnnouncementSaving(false)
    }
  }

  const handleResetAnnouncement = () => {
    setAnnouncement(originalAnnouncement.content)
    setAnnouncementType(originalAnnouncement.type)
    setAnnouncementActive(originalAnnouncement.isActive)
    toast.info('已重置为上次保存的配置')
  }

  const getDisplayThreshold = () => {
    if (thresholdUnit === 'TB') {
      return notificationConfig.auto_approve_threshold_gb / 1024
    }
    return notificationConfig.auto_approve_threshold_gb
  }

  const handleThresholdChange = (value: string) => {
    const numValue = parseFloat(value) || 0
    const gbValue = thresholdUnit === 'TB' ? numValue * 1024 : numValue
    setNotificationConfig((prev) => ({ ...prev, auto_approve_threshold_gb: Math.round(gbValue) }))
  }

  const handleUnitChange = (unit: 'GB' | 'TB') => {
    setThresholdUnit(unit)
  }

  const isSmtpConfigured = smtpForm.host && smtpForm.username && smtpForm.from_email && smtpForm.port

  const tabs = [
    { id: 'smtp' as SettingsTab, label: '邮件配置', icon: Mail },
    { id: 'huggingface' as SettingsTab, label: 'HF 配置', icon: Globe },
    { id: 'notification' as SettingsTab, label: '通知&公告', icon: Bell },
  ]

  if (isSMTPLoading || isHFLoading || isNotificationLoading || isAnnouncementLoading) {
    return <SettingsSkeleton />
  }

  if (smtpError) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">系统设置</h1>
          <p className="text-sm text-muted-foreground">管理系统配置和偏好设置</p>
        </div>
        <SpotlightCard>
          <Alert variant="destructive" className="m-6">
            <AlertCircle className="size-4" />
            <AlertTitle>加载失败</AlertTitle>
            <AlertDescription>无法加载配置信息，请刷新页面重试。</AlertDescription>
          </Alert>
          <div className="px-6 pb-6">
            <Button onClick={handleInitializeDefaults} variant="outline">
              初始化默认配置
            </Button>
          </div>
        </SpotlightCard>
      </div>
    )
  }

  return (
    <motion.div
      className="flex flex-1 flex-col gap-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* 页面标题 */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <motion.div
              initial={{ rotate: -10, scale: 0.9 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <SettingsIcon className="size-5 text-primary" />
            </motion.div>
            <h1 className="text-2xl font-semibold tracking-tight">系统设置</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">管理系统配置和偏好设置</p>
        </div>
        {isSmtpConfigured && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 20 }}
          >
            <Badge variant="success" className="shadow-sm">
              <CheckCircle2 className="mr-1 size-3" />
              SMTP 已配置
            </Badge>
          </motion.div>
        )}
      </motion.div>

      {/* 两栏布局：左侧导航 + 右侧内容 */}
      <motion.div variants={itemVariants} className="grid gap-6 lg:grid-cols-[260px_1fr] lg:items-start">
        {/* 左侧导航 - 桌面端显示 */}
        <nav className="hidden flex-col gap-1.5 lg:flex relative">
          {tabs.map((tab, index) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <motion.button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTabBg"
                    className="absolute inset-0 rounded-xl bg-primary/10 border border-primary/20 shadow-sm"
                    initial={false}
                    transition={springConfig}
                  />
                )}
                <Icon className="size-4 relative z-10" />
                <span className="relative z-10">{tab.label}</span>
              </motion.button>
            )
          })}
        </nav>

        {/* 移动端 Tab 导航 */}
        <div className="relative flex gap-1 overflow-x-auto pb-2 lg:hidden -mx-2 px-2 scrollbar-hide">
          <div className="flex gap-1 p-1 bg-muted/60 rounded-xl w-full">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <motion.button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap',
                    isActive ? 'text-primary-foreground' : 'text-muted-foreground'
                  )}
                  whileTap={{ scale: 0.97 }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeMobileTab"
                      className="absolute inset-0 bg-primary rounded-lg shadow-sm"
                      initial={false}
                      transition={springConfig}
                    />
                  )}
                  <Icon className="size-3.5 relative z-10" />
                  <span className="relative z-10">{tab.label}</span>
                </motion.button>
              )
            })}
          </div>
        </div>

        {/* 右侧内容区 */}
        <div className="space-y-5 min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            {activeTab === 'smtp' && (
              <motion.div
                key="smtp"
                variants={panelVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="space-y-5"
              >
                <SettingsSection
                  icon={<Mail className="size-5" />}
                  title="SMTP 邮件服务配置"
                  description="配置 SMTP 服务器用于发送任务通知邮件"
                  footer={
                    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <ChangeStatus hasChanges={hasChanges} />
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        {testResult && (
                          <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn(
                              'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm',
                              testResult.success
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                            )}
                          >
                            {testResult.success ? (
                              <CheckCircle2 className="size-4" />
                            ) : (
                              <AlertCircle className="size-4" />
                            )}
                            <span className="max-w-50 truncate">{testResult.message}</span>
                          </motion.div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            onClick={handleTestConnection}
                            disabled={isTesting || isSaving}
                            className="gap-2 min-w-25"
                          >
                            {isTesting ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Plug className="size-4" />
                            )}
                            测试连接
                          </Button>
                          <Button
                            variant="outline"
                            onClick={handleReset}
                            disabled={!hasChanges || isSaving}
                            className="gap-2"
                          >
                            <RotateCcw className="size-4" />
                            重置
                          </Button>
                          <Button
                            onClick={handleSaveSmtp}
                            disabled={!hasChanges || isSaving}
                            className="gap-2 min-w-25"
                          >
                            {isSaving && <Loader2 className="size-4 animate-spin" />}
                            {!isSaving && <Save className="size-4" />}
                            保存更改
                          </Button>
                        </div>
                      </div>
                    </div>
                  }
                >
                  <div className="space-y-5">
                    <div className="space-y-3">
                      <SectionHeader icon={<Server className="size-4" />} title="服务器配置" />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <FormField
                          id="smtp-host"
                          label="SMTP 服务器地址"
                          value={smtpForm.host}
                          onChange={(value) => handleSmtpChange('host', value)}
                          placeholder="smtp.example.com"
                          error={validationErrors.host}
                        />
                        <FormField
                          id="smtp-port"
                          label="端口"
                          value={smtpForm.port}
                          onChange={(value) => handleSmtpChange('port', value)}
                          placeholder="587"
                          type="number"
                          error={validationErrors.port}
                        />
                      </div>
                    </div>

                    <Separator className="my-1" />

                    <div className="space-y-3">
                      <SectionHeader icon={<Shield className="size-4" />} title="身份认证" />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <FormField
                          id="smtp-username"
                          label="用户名"
                          value={smtpForm.username}
                          onChange={(value) => handleSmtpChange('username', value)}
                          placeholder="your@email.com"
                          error={validationErrors.username}
                        />
                        <div className="space-y-2">
                          <Label htmlFor="smtp-password" className="text-sm font-medium">
                            密码
                            {!smtpForm.password && originalForm.host && (
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                (已设置，留空保持不变)
                              </span>
                            )}
                          </Label>
                          <div className="relative">
                            <Input
                              id="smtp-password"
                              type={showPassword ? 'text' : 'password'}
                              placeholder="••••••••"
                              value={smtpForm.password}
                              onChange={(e) => handleSmtpChange('password', e.target.value)}
                              className="pr-11"
                            />
                            <button
                              type="button"
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted/50"
                              onClick={() => setShowPassword(!showPassword)}
                            >
                              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <Separator className="my-1" />

                    <div className="space-y-3">
                      <SectionHeader icon={<Sparkles className="size-4" />} title="发送设置" />
                      <FormField
                        id="smtp-from-email"
                        label="发件人邮箱"
                        value={smtpForm.from_email}
                        onChange={(value) => handleSmtpChange('from_email', value)}
                        placeholder="noreply@example.com"
                        type="email"
                        helperText="发送邮件时显示的发件人地址"
                        error={validationErrors.from_email}
                      />

                      <ToggleItem
                        id="use-tls"
                        title="使用 TLS 加密"
                        description="推荐开启，保护邮件传输安全"
                        checked={smtpForm.use_tls}
                        onCheckedChange={(checked) => handleSmtpChange('use_tls', checked)}
                      />
                    </div>

                    {isSmtpConfigured && (
                      <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                        <CheckCircle2 className="size-4" />
                        <AlertTitle>配置完整</AlertTitle>
                        <AlertDescription>SMTP 配置已完整填写，保存后将生效。</AlertDescription>
                      </Alert>
                    )}
                  </div>
                </SettingsSection>
              </motion.div>
            )}

            {activeTab === 'huggingface' && (
              <motion.div
                key="huggingface"
                variants={panelVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="space-y-5"
              >
                <SettingsSection
                  icon={<Globe className="size-5" />}
                  title="HuggingFace Endpoint 配置"
                  description="配置可用的 HuggingFace 下载节点和默认节点"
                  footer={
                    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <ChangeStatus hasChanges={hasHFChanges} />
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <Button
                          variant="outline"
                          onClick={handleResetHF}
                          disabled={!hasHFChanges || isHFSaving}
                          className="gap-2"
                        >
                          <RotateCcw className="size-4" />
                          重置
                        </Button>
                        <Button
                          onClick={handleSaveHF}
                          disabled={!hasHFChanges || isHFSaving}
                          className="gap-2 min-w-25"
                        >
                          {isHFSaving && <Loader2 className="size-4 animate-spin" />}
                          {!isHFSaving && <Save className="size-4" />}
                          保存更改
                        </Button>
                      </div>
                    </div>
                  }
                >
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <SectionHeader icon={<Server className="size-4" />} title="Endpoint 列表" />
                      <div className="space-y-2">
                        <AnimatePresence initial={false}>
                          {hfEndpoints.map((ep, idx) => (
                            <EndpointRow
                              key={idx}
                              index={idx}
                              value={ep}
                              onChange={(value) => handleUpdateHFEndpoint(idx, value)}
                              onRemove={() => handleRemoveHFEndpoint(idx)}
                              canRemove={hfEndpoints.length > 1}
                              isDefault={hfDefaultEndpoint === ep}
                              onSetDefault={() => setHfDefaultEndpoint(ep)}
                            />
                          ))}
                        </AnimatePresence>
                        <Button
                          variant="outline"
                          onClick={handleAddHFEndpoint}
                          className="gap-2 w-full hover:border-primary/30 hover:bg-primary/2"
                        >
                          <Plus className="size-4" />
                          添加 Endpoint
                        </Button>
                      </div>
                    </div>
                  </div>
                </SettingsSection>
              </motion.div>
            )}

            {activeTab === 'notification' && (
              <motion.div
                key="notification"
                variants={panelVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="space-y-5"
              >
                <SettingsSection
                  icon={<Bell className="size-5" />}
                  title="通知设置"
                  description="配置系统通知和告警方式"
                  footer={
                    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <ChangeStatus hasChanges={hasNotificationChanges} />
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <Button
                          variant="outline"
                          onClick={handleResetNotification}
                          disabled={!hasNotificationChanges || isNotificationSaving}
                          className="gap-2"
                        >
                          <RotateCcw className="size-4" />
                          重置
                        </Button>
                        <Button
                          onClick={handleSaveNotification}
                          disabled={!hasNotificationChanges || isNotificationSaving}
                          className="gap-2 min-w-25"
                        >
                          {isNotificationSaving && <Loader2 className="size-4 animate-spin" />}
                          {!isNotificationSaving && <Save className="size-4" />}
                          保存更改
                        </Button>
                      </div>
                    </div>
                  }
                >
                  <div className="space-y-5">
                    <div className="space-y-3">
                      <SectionHeader icon={<Mail className="size-4" />} title="通知接收邮箱" />
                      <FormField
                        id="notification-email"
                        label="接收邮箱地址"
                        value={notificationConfig.email}
                        onChange={(value) => setNotificationConfig((prev) => ({ ...prev, email: value }))}
                        placeholder="admin@example.com, ops@example.com"
                        helperText="多个邮箱用逗号分隔，用于接收系统通知"
                      />
                    </div>

                    <Separator className="my-1" />

                    <div className="space-y-3">
                      <SectionHeader icon={<Bell className="size-4" />} title="任务审批推送" />
                      <ToggleItem
                        id="task-approval-push"
                        title="任务审批推送"
                        description="有新任务需要审批时发送邮件通知"
                        checked={notificationConfig.task_approval_push}
                        onCheckedChange={(checked) =>
                          setNotificationConfig((prev) => ({ ...prev, task_approval_push: checked }))
                        }
                        icon={<Bell className="size-4" />}
                      />
                    </div>

                    <Separator className="my-1" />

                    <div className="space-y-3">
                      <SectionHeader icon={<Sparkles className="size-4" />} title="自动审批" />
                      <ToggleItem
                        id="auto-approve"
                        title="开启自动审批"
                        description="符合条件的任务将自动通过审批，无需手动操作"
                        checked={notificationConfig.auto_approve_enabled}
                        onCheckedChange={(checked) =>
                          setNotificationConfig((prev) => ({ ...prev, auto_approve_enabled: checked }))
                        }
                        icon={<CheckCircle2 className="size-4" />}
                      />

                      <AnimatePresence>
                        {notificationConfig.auto_approve_enabled && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="space-y-3 rounded-xl border border-border/60 p-4 bg-muted/20">
                              <Label className="text-sm font-medium">自动审批阈值</Label>
                              <div className="flex items-center gap-3">
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.1}
                                  value={getDisplayThreshold()}
                                  onChange={(e) => handleThresholdChange(e.target.value)}
                                  className="w-32"
                                />
                                <Select
                                  value={thresholdUnit}
                                  onValueChange={(v) => handleUnitChange(v as 'GB' | 'TB')}
                                >
                                  <SelectTrigger className="w-24">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="GB">GB</SelectItem>
                                    <SelectItem value="TB">TB</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                任务所需存储空间小于此阈值时将自动审批通过
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <Alert className="border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">
                      <AlertCircle className="size-4" />
                      <AlertTitle>提示</AlertTitle>
                      <AlertDescription>通知功能需要先配置 SMTP 邮件服务才能正常工作。</AlertDescription>
                    </Alert>
                  </div>
                </SettingsSection>

                <SettingsSection
                  icon={<Server className="size-5" />}
                  title="公告设置"
                  description="配置系统公告内容，将在首页顶部展示"
                  footer={
                    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <ChangeStatus hasChanges={hasAnnouncementChanges} />
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <Button
                          variant="outline"
                          onClick={handleResetAnnouncement}
                          disabled={!hasAnnouncementChanges || isAnnouncementSaving}
                          className="gap-2"
                        >
                          <RotateCcw className="size-4" />
                          重置
                        </Button>
                        <Button
                          onClick={handleSaveAnnouncement}
                          disabled={!hasAnnouncementChanges || isAnnouncementSaving}
                          className="gap-2 min-w-25"
                        >
                          {isAnnouncementSaving && <Loader2 className="size-4 animate-spin" />}
                          {!isAnnouncementSaving && <Save className="size-4" />}
                          保存更改
                        </Button>
                      </div>
                    </div>
                  }
                  delay={0.1}
                >
                  <div className="space-y-5">
                    <ToggleItem
                      id="announcement-active"
                      title="启用公告"
                      description="开启后公告将在首页顶部展示"
                      checked={announcementActive}
                      onCheckedChange={setAnnouncementActive}
                      icon={<Bell className="size-4" />}
                    />

                    <Separator className="my-1" />

                    <div className="space-y-3">
                      <SectionHeader icon={<Sparkles className="size-4" />} title="公告类型" />
                      <div className="flex gap-3">
                        <Button
                          type="button"
                          variant={announcementType === 'info' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setAnnouncementType('info')}
                          className="flex-1"
                        >
                          <Info className="size-4 mr-2" />
                          普通
                        </Button>
                        <Button
                          type="button"
                          variant={announcementType === 'warning' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setAnnouncementType('warning')}
                          className="flex-1"
                        >
                          <AlertTriangle className="size-4 mr-2" />
                          重要
                        </Button>
                        <Button
                          type="button"
                          variant={announcementType === 'urgent' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setAnnouncementType('urgent')}
                          className="flex-1"
                        >
                          <AlertCircle className="size-4 mr-2" />
                          紧急
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        不同类型显示不同颜色：普通为蓝色，重要为黄色，紧急为红色
                      </p>
                    </div>

                    <Separator className="my-1" />

                    <div className="space-y-2">
                      <Label htmlFor="system-announcement" className="text-sm font-medium">
                        公告内容
                      </Label>
                      <Textarea
                        id="system-announcement"
                        value={announcement}
                        onChange={(e) => setAnnouncement(e.target.value)}
                        placeholder="输入系统公告内容..."
                        rows={4}
                      />
                      <p className="text-xs text-muted-foreground">
                        公告内容会在首页顶部以横幅形式展示，用户可关闭
                      </p>
                    </div>
                  </div>
                </SettingsSection>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default Settings
