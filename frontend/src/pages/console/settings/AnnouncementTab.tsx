import { Info, AlertTriangle, AlertCircle, Bell, Sparkles, Server } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import {
  SettingsSection,
  SectionHeader,
  ToggleItem,
  ActionsFooter,
} from './components'
import { useConfigForm } from './use-config-form'
import type { AnnouncementConfigResponse } from '@/lib/api-types'

type AnnouncementType = 'info' | 'warning' | 'urgent'

interface AnnouncementForm {
  content: string
  announcement_type: AnnouncementType
  is_active: boolean
}

const typeOptions: { value: AnnouncementType; label: string; icon: typeof Info; activeClass: string; ringClass: string }[] = [
  { value: 'info', label: '普通', icon: Info, activeClass: 'bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-950 dark:border-sky-800 dark:text-sky-200', ringClass: 'ring-sky-200 dark:ring-sky-800' },
  { value: 'warning', label: '重要', icon: AlertTriangle, activeClass: 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200', ringClass: 'ring-amber-200 dark:ring-amber-800' },
  { value: 'urgent', label: '紧急', icon: AlertCircle, activeClass: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-200', ringClass: 'ring-red-200 dark:ring-red-800' },
]

export function AnnouncementTab() {
  const { form, setField, hasChanges, save, reset, isSaving, isLoading, error } = useConfigForm<
    AnnouncementForm,
    AnnouncementConfigResponse
  >({
    category: 'announcement',
    defaultForm: { content: '', announcement_type: 'info', is_active: true },
    responseToForm: (data) => ({
      content: data.content,
      announcement_type: data.announcement_type,
      is_active: data.is_active,
    }),
    formToRequest: (f) => ({
      content: f.content,
      announcement_type: f.announcement_type,
      is_active: f.is_active,
    }),
  })

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="h-80 rounded-2xl bg-muted/30 animate-pulse" />
        <div className="h-48 rounded-2xl bg-muted/30 animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertTitle>加载失败</AlertTitle>
        <AlertDescription>{error.message || '无法加载公告配置，请刷新页面重试。'}</AlertDescription>
      </Alert>
    )
  }

  const selectedOption = typeOptions.find((o) => o.value === form.announcement_type)!

  return (
    <div className="space-y-5">
      <SettingsSection
        icon={<Server className="size-5" />}
        title="公告设置"
        description="配置系统公告内容，将在首页顶部展示"
        footer={<ActionsFooter hasChanges={hasChanges} isSaving={isSaving} onSave={save} onReset={reset} />}
      >
        <div className="space-y-5">
          <ToggleItem
            id="announcement-active"
            title="启用公告"
            description="开启后公告将在首页顶部展示"
            checked={form.is_active}
            onCheckedChange={(v) => setField('is_active', v)}
            icon={<Bell className="size-4" />}
          />

          <Separator />

          {/* Type selector — refined segmented control */}
          <div className="space-y-3">
            <SectionHeader icon={<Sparkles className="size-4" />} title="公告类型" />
            <div className="flex gap-2">
              {typeOptions.map((opt) => {
                const isSelected = form.announcement_type === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setField('announcement_type', opt.value)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-200',
                      'hover:shadow-sm active:scale-[0.98]',
                      isSelected
                        ? `${opt.activeClass} border shadow-sm ring-1 ${opt.ringClass}`
                        : 'border-border/60 bg-background text-muted-foreground hover:text-foreground hover:border-border'
                    )}
                  >
                    <opt.icon className="size-4" />
                    {opt.label}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              不同类型显示不同颜色：普通为蓝色，重要为黄色，紧急为红色
            </p>
          </div>

          <Separator />

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="system-announcement" className="text-sm font-medium">
              公告内容
            </Label>
            <Textarea
              id="system-announcement"
              value={form.content}
              onChange={(e) => setField('content', e.target.value)}
              placeholder="输入系统公告内容..."
              rows={4}
              className="transition-all duration-200 focus:border-primary/50"
            />
            <p className="text-xs text-muted-foreground">
              公告内容会在首页顶部以横幅形式展示，用户可关闭
            </p>
          </div>
        </div>
      </SettingsSection>
    </div>
  )
}
