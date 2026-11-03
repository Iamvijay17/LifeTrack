import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

/**
 * React Hook Form + Zod for a create/edit dialog.
 * The form is reset to `valuesFor()` each time the dialog opens or the edited record changes (`recordKey`) — never on
 * unrelated re-renders, so typing is never clobbered. `valuesFor` is read through a ref, so it always sees current
 * props without being an effect dependency (this replaces the per-dialog `eslint-disable exhaustive-deps` pattern).
 *
 *   const form = useDialogForm({ open, schema, recordKey: task?.id, valuesFor: () => (task ? fromTask(task) : blank) })
 */
export function useDialogForm({ open, schema, valuesFor, recordKey }) {
  const latest = useRef(valuesFor)
  latest.current = valuesFor
  const form = useForm({ resolver: zodResolver(schema), defaultValues: valuesFor() })
  const { reset } = form
  useEffect(() => {
    if (open) reset(latest.current())
  }, [open, recordKey, reset])
  return form
}
