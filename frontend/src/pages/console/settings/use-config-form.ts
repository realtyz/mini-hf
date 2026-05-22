import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '@/lib/api'
import { STRINGS } from '@/lib/constants/strings'
import { queryKeys } from '@/lib/query-keys'
import endpoints from '@/lib/api-endpoints'
import type { ApiResponse } from '@/lib/api-types'
import { isEqual } from 'lodash-es'

export interface UseConfigFormOptions<TForm extends Record<string, unknown>, TResponse> {
  /** API category name, e.g. 'smtp', 'notification' */
  category: string
  /** Default form values before data loads */
  defaultForm: TForm
  /** Transform API response to local form state */
  responseToForm: (data: TResponse) => TForm
  /** Transform local form state to API request body */
  formToRequest?: (form: TForm) => Record<string, unknown>
  /** Override default save. If provided, called instead of PUT /config/category/{category} */
  saveFn?: (form: TForm) => Promise<void>
  /** Side effect after successful save (e.g. clear password field) */
  onSaved?: (form: TForm) => void
}

export interface UseConfigFormReturn<TForm extends Record<string, unknown>> {
  form: TForm
  /** The last-saved snapshot for reset */
  originalForm: TForm
  /** Update a single field */
  setField: <K extends keyof TForm>(field: K, value: TForm[K]) => void
  /** Bulk update form */
  setForm: (form: TForm) => void
  /** Whether the form differs from the last saved state */
  hasChanges: boolean
  /** Save via PUT /config/category/{category}, shows success toast */
  save: () => Promise<void>
  /** Revert to last saved state, shows info toast */
  reset: () => void
  isSaving: boolean
  isLoading: boolean
  error: Error | null
}

export function useConfigForm<TForm extends Record<string, unknown>, TResponse>(
  options: UseConfigFormOptions<TForm, TResponse>
): UseConfigFormReturn<TForm> {
  const { category, defaultForm, responseToForm, formToRequest, saveFn, onSaved } = options
  const queryClient = useQueryClient()

  const [form, setFormState] = useState<TForm>(defaultForm)
  const [originalForm, setOriginalForm] = useState<TForm>(defaultForm)
  const responseToFormRef = useRef(responseToForm)

  useEffect(() => {
    responseToFormRef.current = responseToForm
  }, [responseToForm])

  const query = useQuery({
    queryKey: [...queryKeys.configs.all, category],
    queryFn: () => api.get<ApiResponse<TResponse>>(endpoints.config.category(category)),
  })

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.put(endpoints.config.category(category), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.all })
    },
  })

  // Sync API data → local form on first load
  useEffect(() => {
    if (query.data?.data) {
      const newForm = responseToFormRef.current(query.data.data)
      setFormState(newForm)
      setOriginalForm(newForm)
    }
  }, [query.data])

  const hasChanges = !isEqual(form, originalForm)

  const setField = useCallback(
    <K extends keyof TForm>(field: K, value: TForm[K]) => {
      setFormState((prev) => ({ ...prev, [field]: value }))
    },
    []
  )

  const save = useCallback(async () => {
    if (saveFn) {
      await saveFn(form)
    } else {
      const requestBody = formToRequest?.(form) ?? form
      await saveMutation.mutateAsync(requestBody)
    }
    setOriginalForm(form)
    onSaved?.(form)
    toast.success(STRINGS.configSaved)
  }, [form, formToRequest, saveFn, saveMutation, onSaved])

  const reset = useCallback(() => {
    setFormState(originalForm)
    toast.info(STRINGS.resetSuccess)
  }, [originalForm])

  return {
    form,
    originalForm,
    setField,
    setForm: setFormState,
    hasChanges,
    save,
    reset,
    isSaving: saveMutation.isPending,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  }
}

/** Standalone mutation for initializing default configs (used by error recovery) */
export function useInitializeDefaults() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post(endpoints.config.init),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.all })
    },
  })
}
