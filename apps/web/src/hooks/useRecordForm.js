import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

/**
 * A form that edits ONE stored record (a day's journal entry, a day's health log) and stays in step with the database.
 *  - `recordKey` identifies which record is shown (e.g. the date). Changing it loads that record, replacing the form.
 *  - `version` changes when the stored record changes (e.g. `${id}|${updated_at}`), including from another device.
 *    The new values are applied to fields you have NOT touched; fields you are editing keep your text.
 *  - `valuesFor()` returns the form values for the stored record (read through a ref, so it is always current).
 * After saving, call `form.reset(savedValues)` so the saved text becomes the baseline and the form is clean again.
 */
export function useRecordForm({ schema, recordKey, version, valuesFor }) {
  const form = useForm({ resolver: zodResolver(schema), defaultValues: valuesFor() })
  const { reset } = form
  const isDirty = form.formState.isDirty
  const latest = useRef(valuesFor)
  latest.current = valuesFor
  const dirty = useRef(false)
  dirty.current = isDirty
  const shown = useRef(recordKey)

  useEffect(() => {
    const switched = shown.current !== recordKey
    shown.current = recordKey
    if (switched || !dirty.current) reset(latest.current())
    else reset(latest.current(), { keepDirtyValues: true })
  }, [recordKey, version, reset])

  return form
}
