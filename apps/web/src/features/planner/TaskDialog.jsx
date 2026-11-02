import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { TASK_CATEGORIES, PRIORITIES } from '@lifetrack/constants/defaults'
import { RECURRENCES } from '@lifetrack/core/recurrence'
import { taskFormSchema as schema, blankTask, taskToForm, taskFormToPayload } from '@lifetrack/schemas'
import { useAction } from '@/hooks/useAction'
import { createTask } from '@/services/api'
import * as store from '@/hooks/store'

export function TaskDialog({ open, onOpenChange, task, defaultDate = '' }) {
  const blank = blankTask(defaultDate)
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: blank })
  useEffect(() => {
    if (!open) return
    reset(task ? taskToForm(task) : blank)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, defaultDate])
  const recurrence = watch('recurrence')

  const [save, pending] = useAction(async (v) => {
    const data = taskFormToPayload(v)
    if (task) await store.update('tasks', task.id, data)
    else await createTask(data)
    onOpenChange(false)
  }, { success: task ? 'Task updated' : 'Task added' })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={task ? 'Edit task' : 'New task'} pending={pending} onSubmit={handleSubmit(save)} submitLabel={task ? 'Save changes' : 'Add task'}>
      <Field label="Title" error={errors.title?.message}><Input autoFocus placeholder="What needs to get done?" {...register('title')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category"><Select {...register('category')}>{TASK_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Priority"><Select {...register('priority')}>{PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select></Field>
        <Field label="Due date" error={errors.due_date?.message}><Input type="date" {...register('due_date')} /></Field>
        <Field label="Repeat"><Select {...register('recurrence')}>{RECURRENCES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select></Field>
      </div>
      {recurrence !== 'none' && <Field label="Repeat until (optional)" error={errors.recurrence_until?.message}><Input type="date" {...register('recurrence_until')} /></Field>}
      <Field label="Notes" error={errors.notes?.message}><Textarea {...register('notes')} /></Field>
    </FormDialog>
  )
}
