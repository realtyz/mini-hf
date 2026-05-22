import { useState } from 'react'
import { Bell, Mail, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  SettingsSection,
  SectionHeader,
  FormField,
  ToggleItem,
  ActionsFooter,
} from './SettingsComponents'
import { useConfigForm } from './use-config-form'
import { motion, AnimatePresence } from 'framer-motion'
import type { NotificationConfigResponse } from '@/lib/api/types'

interface NotificationForm {
  email: string
  task_approval_push: boolean
  auto_approve_enabled: boolean
  auto_approve_threshold_gb: number
}

export function NotificationTab() {
  const [thresholdUnit, setThresholdUnit] = useState<'GB' | 'TB'>('GB')

  const { form, setField, hasChanges, save, reset, isSaving, isLoading, error } = useConfigForm<
    NotificationForm,
    NotificationConfigResponse
  >({
    category: 'notification',
    defaultForm: {
      email: '',
      task_approval_push: true,
      auto_approve_enabled: false,
      auto_approve_threshold_gb: 100,
    },
    responseToForm: (data) => {
      if (data.auto_approve_threshold_gb >= 1024) {
        setThresholdUnit('TB')
      }
      return {
        email: data.email,
        task_approval_push: data.task_approval_push,
        auto_approve_enabled: data.auto_approve_enabled,
        auto_approve_threshold_gb: data.auto_approve_threshold_gb,
      }
    },
    formToRequest: (f) => f,
  })

  const getDisplayThreshold = () => {
    if (thresholdUnit === 'TB') return form.auto_approve_threshold_gb / 1024
    return form.auto_approve_threshold_gb
  }

  const handleThresholdChange = (value: string) => {
    const numValue = parseFloat(value) || 0
    const gbValue = thresholdUnit === 'TB' ? numValue * 1024 : numValue
    setField('auto_approve_threshold_gb', Math.round(gbValue))
  }

  const handleUnitChange = (unit: 'GB' | 'TB') => {
    setThresholdUnit(unit)
  }

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="h-96 rounded-2xl bg-muted/30 animate-pulse" />
        <div className="h-48 rounded-2xl bg-muted/30 animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertTitle>加载失败</AlertTitle>
        <AlertDescription>{error.message || '无法加载通知配置，请刷新页面重试。'}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-5">
      <SettingsSection
        icon={<Bell className="size-5" />}
        title="通知设置"
        description="配置系统通知和告警方式"
        footer={<ActionsFooter hasChanges={hasChanges} isSaving={isSaving} onSave={save} onReset={reset} />}
      >
        <div className="space-y-5">
          {/* Notification email */}
          <div className="space-y-3">
            <SectionHeader icon={<Mail className="size-4" />} title="通知接收邮箱" />
            <FormField
              id="notification-email"
              label="接收邮箱地址"
              value={form.email}
              onChange={(v) => setField('email', v)}
              placeholder="admin@example.com, ops@example.com"
              helperText="多个邮箱用逗号分隔，用于接收系统通知"
            />
          </div>

          <Separator />

          {/* Task approval push */}
          <div className="space-y-3">
            <SectionHeader icon={<Bell className="size-4" />} title="任务审批推送" />
            <ToggleItem
              id="task-approval-push"
              title="任务审批推送"
              description="有新任务需要审批时发送邮件通知"
              checked={form.task_approval_push}
              onCheckedChange={(v) => setField('task_approval_push', v)}
              icon={<Bell className="size-4" />}
            />
          </div>

          <Separator />

          {/* Auto approve */}
          <div className="space-y-3">
            <SectionHeader icon={<Sparkles className="size-4" />} title="自动审批" />
            <ToggleItem
              id="auto-approve"
              title="开启自动审批"
              description="符合条件的任务将自动通过审批，无需手动操作"
              checked={form.auto_approve_enabled}
              onCheckedChange={(v) => setField('auto_approve_enabled', v)}
              icon={<CheckCircle2 className="size-4" />}
            />

            <AnimatePresence>
              {form.auto_approve_enabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="space-y-3 rounded-xl border border-border/40 bg-muted/10 p-4 mt-1">
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

          {/* Info alert */}
          <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/50 px-4 py-3 dark:border-sky-900 dark:bg-sky-950/50">
            <AlertCircle className="size-4 text-sky-600 dark:text-sky-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-sky-800 dark:text-sky-200">提示</p>
              <p className="text-xs text-sky-700/80 dark:text-sky-300/80">通知功能需要先配置 SMTP 邮件服务才能正常工作。</p>
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  )
}
