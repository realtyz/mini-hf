import { Globe, Server, Plus, Trash2, AlertCircle, Star } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { SettingsSection, SectionHeader, ActionsFooter } from './components'
import { useConfigForm } from './use-config-form'
import { motion, AnimatePresence } from 'framer-motion'
import type { HFEndpointConfigResponse } from '@/lib/api-types'

interface HFForm {
  endpoints: string[]
  default_endpoint: string
}

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
        isDefault
          ? 'border-primary/20 bg-primary/3 ring-1 ring-primary/10'
          : 'hover:border-primary/20 hover:bg-muted/20'
      )}
    >
      <div
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors',
          isDefault
            ? 'bg-primary/15 text-primary'
            : 'bg-muted text-muted-foreground'
        )}
      >
        {isDefault ? <Star className="size-3.5" /> : index + 1}
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
          disabled={isDefault}
        >
          {isDefault ? '默认' : '设为默认'}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={!canRemove}
          className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </motion.div>
  )
}

export function HfEndpointTab() {
  const { form, setField, setForm, hasChanges, save, reset, isSaving, isLoading, error } = useConfigForm<
    HFForm,
    HFEndpointConfigResponse
  >({
    category: 'huggingface',
    defaultForm: { endpoints: ['https://huggingface.co'], default_endpoint: 'https://huggingface.co' },
    responseToForm: (data) => ({
      endpoints: data.endpoints,
      default_endpoint: data.default_endpoint,
    }),
    formToRequest: (f) => {
      const cleaned = f.endpoints.map((e) => e.trim()).filter((e) => e)
      return { endpoints: cleaned, default_endpoint: f.default_endpoint.trim() }
    },
  })

  const addEndpoint = () => {
    setForm({ ...form, endpoints: [...form.endpoints, ''] })
  }

  const removeEndpoint = (index: number) => {
    const next = form.endpoints.filter((_, i) => i !== index)
    const endpoint = form.endpoints[index]
    const newDefault = form.default_endpoint === endpoint && next.length > 0 ? next[0] : form.default_endpoint
    setForm({ endpoints: next, default_endpoint: newDefault })
  }

  const updateEndpoint = (index: number, value: string) => {
    const old = form.endpoints[index]
    const next = [...form.endpoints]
    next[index] = value
    const newDefault = form.default_endpoint === old ? value : form.default_endpoint
    setForm({ endpoints: next, default_endpoint: newDefault })
  }

  if (isLoading) {
    return (
      <div className="h-64 rounded-2xl bg-muted/30 animate-pulse" />
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertTitle>加载失败</AlertTitle>
        <AlertDescription>{error.message || '无法加载 HF 配置，请刷新页面重试。'}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-5">
      <SettingsSection
        icon={<Globe className="size-5" />}
        title="HuggingFace Endpoint 配置"
        description="配置可用的 HuggingFace 下载节点和默认节点"
        footer={<ActionsFooter hasChanges={hasChanges} isSaving={isSaving} onSave={save} onReset={reset} />}
      >
        <div className="space-y-4">
          <div className="space-y-3">
            <SectionHeader icon={<Server className="size-4" />} title="Endpoint 列表" />
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {form.endpoints.map((ep, idx) => (
                  <EndpointRow
                    key={idx}
                    index={idx}
                    value={ep}
                    onChange={(v) => updateEndpoint(idx, v)}
                    onRemove={() => removeEndpoint(idx)}
                    canRemove={form.endpoints.length > 1}
                    isDefault={form.default_endpoint === ep}
                    onSetDefault={() => setField('default_endpoint', ep)}
                  />
                ))}
              </AnimatePresence>
              <Button
                variant="outline"
                onClick={addEndpoint}
                className="gap-2 w-full hover:border-primary/30 hover:bg-primary/2 transition-all duration-200"
              >
                <Plus className="size-4" />
                添加 Endpoint
              </Button>
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  )
}
