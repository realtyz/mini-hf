import { memo, useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { isEqual } from 'lodash-es'
import { Skeleton } from '@/components/ui/skeleton'
import { SettingsSection } from './SettingsSection'
import { ActionsFooter } from './ActionsFooter'
import { ConfigField } from './ConfigField'
import { useBatchUpdateConfigs } from '@/hooks/api'
import type { ConfigCategorySchema, ConfigFieldSchema } from '@/lib/api/types'

interface ConfigFormEngineProps {
  category: ConfigCategorySchema
  actionSlot?: (form: Record<string, unknown>) => React.ReactNode
}

function valueFromField(field: ConfigFieldSchema): unknown {
  if (field.sensitive) return ''
  if (field.value !== undefined && field.value !== null && field.value !== '') return field.value
  return field.default ?? ''
}

function serializeValue(value: unknown, field: ConfigFieldSchema): string {
  if (value === null || value === undefined) return ''

  switch (field.type) {
    case 'json': {
      if (field.ui.widget === 'hf_endpoint_list' && Array.isArray(value)) {
        value = value.filter((e: string) => e.trim() !== '')
      }
      return JSON.stringify(value)
    }
    case 'bool':
      return Boolean(value).toString()
    case 'int':
      return String(Number(value))
    case 'float':
      return String(Number(value))
    case 'password':
    case 'string':
    case 'select':
    default:
      return String(value)
  }
}

function FormSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-4 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 pt-2">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    </div>
  )
}

export const ConfigFormEngine = memo(function ConfigFormEngine({ category, actionSlot }: ConfigFormEngineProps) {
  const initialValues = useMemo(
    () => Object.fromEntries(category.fields.map((field) => [field.key, valueFromField(field)])),
    [category.fields]
  )
  const [form, setForm] = useState<Record<string, unknown>>(initialValues)
  const [originalForm, setOriginalForm] = useState<Record<string, unknown>>(initialValues)
  const batchUpdate = useBatchUpdateConfigs()

  const hasChanges = !isEqual(form, originalForm)

  const setField = useCallback((key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const save = useCallback(async () => {
    try {
      await batchUpdate.mutateAsync({
        configs: category.fields.map((field) => ({
          key: field.key,
          value: serializeValue(form[field.key], field),
          category: category.id,
        })),
      })
      setOriginalForm(form)
      toast.success('配置已保存')
    } catch (err: unknown) {
      const message =
        (err as { message?: string })?.message ?? '保存失败，请稍后再试'
      toast.error(message)
    }
  }, [batchUpdate, category.fields, category.id, form])

  const reset = useCallback(() => {
    setForm(originalForm)
    toast.info('已恢复为上次保存的配置')
  }, [originalForm])

  if (!category.fields.length) {
    return (
      <SettingsSection title={category.label} description={category.description}>
        <p className="py-8 text-center text-sm text-muted-foreground">此分类暂无配置项</p>
      </SettingsSection>
    )
  }

  return (
    <SettingsSection
      title={category.label}
      description={category.description}
      footer={
        <ActionsFooter
          hasChanges={hasChanges}
          isSaving={batchUpdate.isPending}
          onSave={save}
          onReset={reset}
        />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {category.fields.map((field) => (
          <ConfigField
            key={field.key}
            field={field}
            value={form[field.key]}
            form={form}
            onChange={setField}
          />
        ))}
      </div>
      {actionSlot ? <div className="mt-5 pt-4 border-t border-border/30">{actionSlot(form)}</div> : null}
    </SettingsSection>
  )
})

export { FormSkeleton }
