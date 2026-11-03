import { useEffect } from 'react'
import { RECURRENCES } from '@lifetrack/core/recurrence'
import { PRIORITIES } from '@lifetrack/constants/defaults'
import { TASK_CATEGORIES, blankTask, type TaskForm as TaskFormValues, taskFormSchema, taskFormToPayload, taskToForm } from '@lifetrack/schemas'
import { api, store } from '../../data/client'
import { useAction } from '../../hooks/useAction'
import { useZodForm } from '../../hooks/useZodForm'
import { Sheet } from '../../ui/Sheet'
import { ChipGroup, DateField } from '../../ui/controls'
import { Button, Field } from '../../ui'

export function TaskForm({ visible, task, defaultDate, onClose }: { visible: boolean; task: any | null; defaultDate: string; onClose: () => void }) {
  const form = useZodForm(taskFormSchema, blankTask(defaultDate))
  const { values, errors, set, reset, validate } = form
  useEffect(() => { if (visible) reset(task ? taskToForm(task) : blankTask(defaultDate)) }, [visible, task?.id, defaultDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const [save, pending] = useAction(async () => {
    const v = validate()
    if (!v) return
    const payload = taskFormToPayload(v)
    if (task) await store.update('tasks', task.id, payload)
    else await api.createTask(payload)
    onClose()
  })
  return (
    <Sheet visible={visible} title={task ? 'Edit task' : 'New task'} onClose={onClose} footer={<Button title={task ? 'Save changes' : 'Add task'} onPress={save} loading={pending} />}>
      <Field label="Title" value={values.title} onChangeText={(t) => set('title', t)} error={errors.title} placeholder="What needs to get done?" autoFocus={!task} returnKeyType="done" maxLength={200} />
      <ChipGroup label="Category" value={values.category} options={TASK_CATEGORIES.map((c) => ({ value: c, label: c }))} onChange={(v) => set('category', v)} />
      <ChipGroup label="Priority" value={values.priority} options={PRIORITIES as { value: TaskFormValues['priority']; label: string }[]} onChange={(v) => set('priority', v)} />
      <DateField label="Due date" value={values.due_date} onChange={(v) => set('due_date', v)} error={errors.due_date} clearable />
      <ChipGroup label="Repeat" value={values.recurrence} options={RECURRENCES as { value: TaskFormValues['recurrence']; label: string }[]} onChange={(v) => set('recurrence', v)} />
      {values.recurrence !== 'none' ? <DateField label="Repeat until (optional)" value={values.recurrence_until} onChange={(v) => set('recurrence_until', v)} error={errors.recurrence_until} clearable /> : null}
      <Field label="Notes" value={values.notes} onChangeText={(t) => set('notes', t)} error={errors.notes} multiline numberOfLines={3} style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }} />
    </Sheet>
  )
}
