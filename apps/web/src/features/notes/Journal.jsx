import { z } from 'zod'
import { Smile, Meh, Frown, Laugh, Angry } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Textarea } from '@/components/ui/form'
import { EmptyState } from '@/components/shared/states'
import { useTable } from '@/hooks/store'
import { useAction } from '@/hooks/useAction'
import { useRecordForm } from '@/hooks/useRecordForm'
import * as store from '@/hooks/store'
import { CONFLICT_KEYS } from '@lifetrack/constants/schema'
import { fmtDay } from '@/lib/dates'
import { cn } from '@/lib/utils'

const MOODS = [
  [1, Angry, 'Rough'],
  [2, Frown, 'Low'],
  [3, Meh, 'Okay'],
  [4, Smile, 'Good'],
  [5, Laugh, 'Great'],
]

const schema = z.object({
  mood: z.number().int().min(1).max(5).nullable(),
  content: z.string().max(20000, 'Keep the reflection under 20,000 characters'),
  wins: z.string().max(2000, 'Keep wins under 2,000 characters'),
})
const valuesOf = (e) => ({ mood: e?.mood ?? null, content: e?.content ?? '', wins: e?.wins ?? '' })

export function Journal({ date }) {
  const { rows } = useTable('journal_entries')
  const entry = rows.find((r) => r.entry_date === date)
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isDirty, errors },
  } = useRecordForm({ schema, recordKey: date, version: `${entry?.id}|${entry?.updated_at}`, valuesFor: () => valuesOf(entry) })

  const mood = watch('mood')
  const [content, wins] = watch(['content', 'wins'])
  const [save, pending] = useAction(
    async (values) => {
      await store.upsert('journal_entries', { entry_date: date, ...values }, { onConflict: CONFLICT_KEYS.journal_entries })
      reset(values) // the saved text is the new baseline, so the form is clean again
    },
    { success: 'Journal saved' },
  )
  const [clear] = useAction(() => store.remove('journal_entries', entry.id), { success: 'Entry deleted' })
  const past = [...rows]
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date))
    .filter((r) => r.entry_date !== date)
    .slice(0, 8)

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardContent className="space-y-4">
          <div>
            <p className="mb-2 text-[13px] font-medium">How was {fmtDay(date, 'EEEE')}?</p>
            <div className="flex gap-2">
              {MOODS.map(([v, Icon, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={mood === v}
                  onClick={() => setValue('mood', mood === v ? null : v, { shouldDirty: true })}
                  className={cn(
                    'flex flex-1 flex-col items-center gap-1 rounded-md border border-border py-2 text-[11px] text-muted-foreground',
                    mood === v && 'border-primary bg-primary/15 text-secondary',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Field label="Reflection" error={errors.content?.message}>
            <Textarea rows={6} placeholder="What happened? What did you learn?" {...register('content')} />
          </Field>
          <Field label="Wins" error={errors.wins?.message}>
            <Textarea rows={2} placeholder="Small or big — what went well?" {...register('wins')} />
          </Field>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{isDirty ? 'Unsaved changes' : entry ? 'Saved' : ''}</span>
            <div className="flex gap-2">
              {entry && (
                <Button variant="ghost" onClick={clear}>
                  Delete
                </Button>
              )}
              <Button
                onClick={handleSubmit(save)}
                loading={pending}
                disabled={!isDirty || (!content.trim() && !wins.trim() && mood == null)}
              >
                Save entry
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="space-y-2 lg:col-span-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent entries</h3>
        {past.length === 0 ? (
          <EmptyState title="No other entries yet" description="Short daily notes build a useful record over time." />
        ) : (
          past.map((e) => (
            <Card key={e.id}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">{fmtDay(e.entry_date, 'EEE, d MMM')}</p>
                <p className="mt-1 line-clamp-3 text-sm">{e.content || e.wins || '—'}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
