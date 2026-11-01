import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { TASK_CATEGORIES, PRIORITIES } from '@/domain/defaults'
import { RECURRENCES } from '@/domain/recurrence'
import { isValidDay } from '@/lib/dates'
import { useAction } from '@/hooks/useAction'
import { createTask } from '@/services/api'
import * as store from '@/hooks/store'

const day = z.string().refine((v) => v === '' || isValidDay(v), 'Enter a valid date')
const schema = z.object({
  title: z.string().trim().min(1, 'Give the task a title').max(200, 'Keep it under 200 characters'),
  notes: z.string().max(2000),
  category: z.enum(TASK_CATEGORIES),
  priority: z.enum(['low', 'medium', 'high']),
  due_date: day,
  recurrence: z.enum(['none', 'daily', 'weekdays', 'weekly', 'monthly']),
  recurrence_until: day,
}).superRefine((v, ctx) => {
  if (v.recurrence !== 'none' && !v.due_date) ctx.addIssue({ code: 'custom', path: ['due_date'], message: 'Repeating tasks need a due date' })
  if (v.recurrence_until && v.due_date && v.recurrence_until < v.due_date) ctx.addIssue({ code: 'custom', path: ['recurrence_until'], message: 'End date must be after the due date' })
})

export function TaskDialog({ open, onOpenChange, task, defaultDate = '' }) {
  const blank = { title: '', notes: '', category: 'Personal', priority: 'medium', due_date: defaultDate, recurrence: 'none', recurrence_until: '' }
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: blank })
  useEffect(() => {
    if (!open) return
    reset(task ? { title: task.title, notes: task.notes ?? '', category: task.category, priority: task.priority, due_date: task.due_date ?? '', recurrence: task.recurrence, recurrence_until: task.recurrence_until ?? '' } : blank)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, defaultDate])
  const recurrence = watch('recurrence')

  const [save, pending] = useAction(async (v) => {
    const data = { ...v, due_date: v.due_date || null, recurrence_until: v.recurrence === 'none' ? null : v.recurrence_until || null }
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
