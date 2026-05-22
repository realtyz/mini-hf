import { useState, useCallback } from 'react'
import {
  Mail, Shield, Eye, EyeOff, Loader2, CheckCircle2,
  AlertCircle, Plug, Server, Sparkles,
} from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import {
  SettingsSection,
  SectionHeader,
  FormField,
  ToggleItem,
  ActionsFooter,
} from './components'
import { useConfigForm } from './use-config-form'
import { useTestSMTPConnection } from '@/hooks/api'
import api from '@/lib/api'
import endpoints from '@/lib/api-endpoints'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import type { SMTPConfigResponse, SMTPTestRequest } from '@/lib/api-types'

interface SMTPForm {
  host: string
  port: string
  username: string
  password: string
  use_tls: boolean
  from_email: string
}

export function SmtpTab() {
  const [showPassword, setShowPassword] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [validationErrors, setValidationErrors] = useState<Partial<Record<keyof SMTPForm, string>>>({})
  const testSMTP = useTestSMTPConnection()
  const [originalHost, setOriginalHost] = useState('')

  const validateForm = useCallback((form: SMTPForm): Partial<Record<keyof SMTPForm, string>> => {
    const errors: Partial<Record<keyof SMTPForm, string>> = {}
    if (!form.host.trim()) errors.host = '请输入 SMTP 服务器地址'
    if (!form.port.trim()) errors.port = '请输入端口号'
    else if (!/^\d+$/.test(form.port)) errors.port = '端口号必须为数字'
    if (!form.username.trim()) errors.username = '请输入用户名'
    if (!form.from_email.trim()) errors.from_email = '请输入发件人邮箱'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.from_email)) errors.from_email = '请输入有效的邮箱地址'
    return errors
  }, [])

  const saveFn = useCallback(async (form: SMTPForm) => {
    const errors = validateForm(form)
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      throw new Error('请检查表单填写是否正确')
    }

    if (!form.password) {
      await api.put(endpoints.config.batch, {
        configs: [
          { key: 'smtp_host', value: form.host, category: 'email' },
          { key: 'smtp_port', value: form.port, category: 'email' },
          { key: 'smtp_username', value: form.username, category: 'email' },
          { key: 'smtp_use_tls', value: String(form.use_tls), category: 'email' },
          { key: 'smtp_from_email', value: form.from_email, category: 'email' },
        ],
      })
    } else {
      const saveData = {
        host: form.host,
        port: parseInt(form.port, 10) || 587,
        username: form.username,
        password: form.password,
        use_tls: form.use_tls,
        from_email: form.from_email,
        test_before_save: true,
      }
      await api.put(endpoints.config.category('smtp'), saveData)
    }
  }, [validateForm])

  const {
    form, setField, hasChanges, save, reset, isSaving, isLoading, error,
  } = useConfigForm<SMTPForm, SMTPConfigResponse>({
    category: 'smtp',
    defaultForm: { host: '', port: '587', username: '', password: '', use_tls: true, from_email: '' },
    responseToForm: (data) => {
      setOriginalHost(data.host)
      return {
        host: data.host,
        port: String(data.port) || '587',
        username: data.username,
        password: '',
        use_tls: data.use_tls,
        from_email: data.from_email,
      }
    },
    saveFn,
    onSaved: (f) => {
      setTestResult(null)
      setValidationErrors({})
      setOriginalHost(f.host)
    },
  })

  const handleFieldChange = useCallback(
    (field: keyof SMTPForm, value: string | boolean) => {
      setField(field, value as SMTPForm[keyof SMTPForm])
      if (validationErrors[field]) {
        setValidationErrors((prev) => ({ ...prev, [field]: undefined }))
      }
    },
    [setField, validationErrors]
  )

  const handleTestConnection = async () => {
    if (!form.host.trim() || !form.username.trim() || !form.password.trim()) {
      toast.error('请填写 SMTP 服务器地址、用户名和密码后再测试')
      return
    }

    setIsTesting(true)
    setTestResult(null)
    try {
      const testData: SMTPTestRequest = {
        host: form.host,
        port: parseInt(form.port, 10) || 587,
        username: form.username,
        password: form.password,
        use_tls: form.use_tls,
        from_email: form.from_email || form.username,
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

  const isSmtpConfigured = form.host && form.username && form.from_email && form.port

  if (isLoading) {
    return (
      <div className="h-96 rounded-2xl bg-muted/30 animate-pulse" />
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertTitle>加载失败</AlertTitle>
        <AlertDescription>{error.message || '无法加载 SMTP 配置，请刷新页面重试。'}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-5">
      <SettingsSection
        icon={<Mail className="size-5" />}
        title="SMTP 邮件服务配置"
        description="配置 SMTP 服务器用于发送任务通知邮件"
        footer={
          <ActionsFooter hasChanges={hasChanges} isSaving={isSaving} onSave={save} onReset={reset} />
        }
      >
        <div className="space-y-5">
          {/* Server config */}
          <div className="space-y-3">
            <SectionHeader icon={<Server className="size-4" />} title="服务器配置" />
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                id="smtp-host"
                label="SMTP 服务器地址"
                value={form.host}
                onChange={(v) => handleFieldChange('host', v)}
                placeholder="smtp.example.com"
                error={validationErrors.host}
              />
              <FormField
                id="smtp-port"
                label="端口"
                value={form.port}
                onChange={(v) => handleFieldChange('port', v)}
                placeholder="587"
                type="number"
                error={validationErrors.port}
              />
            </div>
          </div>

          <Separator />

          {/* Auth */}
          <div className="space-y-3">
            <SectionHeader icon={<Shield className="size-4" />} title="身份认证" />
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                id="smtp-username"
                label="用户名"
                value={form.username}
                onChange={(v) => handleFieldChange('username', v)}
                placeholder="your@email.com"
                error={validationErrors.username}
              />
              <div className="space-y-2">
                <Label htmlFor="smtp-password" className="text-sm font-medium">
                  密码
                  {!form.password && originalHost && (
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
                    value={form.password}
                    onChange={(e) => handleFieldChange('password', e.target.value)}
                    className="pr-11"
                  />
                  <button
                    type="button"
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted/50"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Send settings */}
          <div className="space-y-3">
            <SectionHeader icon={<Sparkles className="size-4" />} title="发送设置" />
            <FormField
              id="smtp-from-email"
              label="发件人邮箱"
              value={form.from_email}
              onChange={(v) => handleFieldChange('from_email', v)}
              placeholder="noreply@example.com"
              type="email"
              helperText="发送邮件时显示的发件人地址"
              error={validationErrors.from_email}
            />

            <ToggleItem
              id="use-tls"
              title="使用 TLS 加密"
              description="推荐开启，保护邮件传输安全"
              checked={form.use_tls}
              onCheckedChange={(v) => handleFieldChange('use_tls', v)}
            />
          </div>

          {/* Configured indicator */}
          {isSmtpConfigured && (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/50">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">配置完整</p>
                <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80">SMTP 配置已完整填写，保存后将生效。</p>
              </div>
            </div>
          )}

          {/* Test connection */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/40 bg-muted/10 px-4 py-3">
            <div className="min-w-0 flex-1">
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
                    <CheckCircle2 className="size-4 shrink-0" />
                  ) : (
                    <AlertCircle className="size-4 shrink-0" />
                  )}
                  <span className="truncate">{testResult.message}</span>
                </motion.div>
              )}
              {!testResult && (
                <p className="text-xs text-muted-foreground">填写服务器信息后可测试连接</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || isSaving}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 rounded-lg border border-border/60 bg-background px-4 py-2 text-sm font-medium transition-all duration-200',
                'hover:bg-muted/50 hover:border-primary/20',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'active:scale-[0.98]'
              )}
            >
              {isTesting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plug className="size-4" />
              )}
              测试连接
            </button>
          </div>
        </div>
      </SettingsSection>
    </div>
  )
}
