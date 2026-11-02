import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAction } from './useAction'
import { saveRow } from '@/services/api'

/**
 * Shared wiring for "create or edit one row" dialogs: schema validation, resetting the form each time the dialog opens
 * (or switches to another row), duplicate-submit protection and saving through the service layer.
 *
 *   const f = useEntityForm({ open, entity: habit, schema, blank, fromEntity, table: 'habits', success: 'Habit saved', onDone: close })
 *   <FormDialog pending={f.pending} onSubmit={f.onSubmit}>…register fields from `f`…</FormDialog>
 *
 * `blank` may change every render (e.g. it contains today's date); the latest value is used when the dialog opens.
 * `resetKeys` re-initialise an open dialog when something else it depends on changes.
 */
export function useEntityForm({ open, entity, schema, blank, fromEntity, table, toRow = (v) => v, success, onDone, resetKeys = [] }) {
  const form = useForm({ resolver: zodResolver(schema), defaultValues: blank })
  const latest = useRef({ blank, fromEntity })
  latest.current = { blank, fromEntity }
  const { reset } = form
  useEffect(() => {
    if (open) reset(entity ? latest.current.fromEntity(entity) : latest.current.blank)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entity?.id, reset, ...resetKeys])
  const [submit, pending] = useAction(async (values) => {
    await saveRow(table, entity, toRow(values))
    onDone?.()
  }, { success })
  return { ...form, onSubmit: form.handleSubmit(submit), pending }
}
