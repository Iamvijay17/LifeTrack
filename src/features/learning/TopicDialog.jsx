import { z } from 'zod'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Textarea } from '@/components/ui/form'
import { TOPIC_GROUPS } from '@/domain/defaults'
import { isValidDay } from '@/lib/dates'
import { useAction } from '@/hooks/useAction'
import { useDialogForm } from '@/hooks/useDialogForm'
import * as store from '@/hooks/store'

const schema = z.object({
  group_name: z.string().trim().min(1, 'Pick a category'),
  name: z.string().trim().min(1, 'Name the topic').max(80),
  notes: z.string().max(5000),
  revision_dates: z.string(),
})

/** "2026-11-05, 2026-11-12" -> { dates, invalid } (de-duplicated, sorted). */
export function parseRevisionDates(text) {
  const raw = text.split(/[\s,]+/).filter(Boolean)
  return { dates: [...new Set(raw.filter(isValidDay))].sort(), invalid: raw.find((d) => !isValidDay(d)) ?? null }
}

export function TopicDialog({ open, onOpenChange, topic, groups = TOPIC_GROUPS, today }) {
  const blank = { group_name: groups[0] ?? 'Frontend', name: '', notes: '', revision_dates: '' }
  const fromTopic = (t) => ({
    group_name: t.group_name,
    name: t.name,
    notes: t.notes ?? '',
    revision_dates: (t.revision_dates ?? []).join(', '),
  })
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useDialogForm({ open, schema, recordKey: topic?.id, valuesFor: () => (topic ? fromTopic(topic) : blank) })

  const [save, pending] = useAction(
    async (v) => {
      const { dates, invalid } = parseRevisionDates(v.revision_dates)
      if (invalid) throw new Error(`"${invalid}" isn't a valid date. Use YYYY-MM-DD, separated by commas.`)
      const row = { group_name: v.group_name, name: v.name, notes: v.notes, revision_dates: dates }
      if (topic) await store.update('learning_topics', topic.id, row)
      else await store.insert('learning_topics', row)
      onOpenChange(false)
    },
    { success: 'Topic saved' },
  )

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={topic ? `Edit ${topic.name}` : 'New topic'}
      pending={pending}
      onSubmit={handleSubmit(save)}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" error={errors.group_name?.message}>
          <Input list="topic-groups" {...register('group_name')} />
          <datalist id="topic-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Field>
        <Field label="Topic" error={errors.name?.message}>
          <Input {...register('name')} />
        </Field>
      </div>
      <Field label="Revision dates" hint={`YYYY-MM-DD, comma separated. e.g. ${today}`} error={errors.revision_dates?.message}>
        <Input {...register('revision_dates')} placeholder={today} />
      </Field>
      <Field label="Notes">
        <Textarea rows={6} {...register('notes')} />
      </Field>
    </FormDialog>
  )
}
