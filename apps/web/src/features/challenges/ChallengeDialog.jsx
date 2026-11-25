import { useEffect, useMemo, useState } from 'react'
import { FormDialog } from '@/components/shared/FormDialog'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { useAction } from '@/hooks/useAction'
import { addDays } from '@/lib/dates'
import { cn } from '@/lib/utils'
import {
  BUILT_IN_TEMPLATES,
  CHALLENGE_CATEGORIES,
  CHALLENGE_COLORS,
  CHALLENGE_KINDS,
  challengeFromTemplate,
  challengeProblems,
  normalizeMilestones,
} from '@/domain/challenges'
import { createChallenge, updateChallenge } from '@/services/api'

const KIND_OPTIONS = CHALLENGE_KINDS.map((k) => ({ value: k.key, label: k.label }))
const blank = (today) => ({
  title: '',
  description: '',
  kind: 'daily',
  target: '1',
  unit: '',
  start_date: today,
  end_date: addDays(today, 29),
  category: 'Personal',
  color: CHALLENGE_COLORS[0],
  habit_id: '',
  milestones: '',
  template_key: null,
})

const milestonesText = (list) =>
  normalizeMilestones(list)
    .map((m) => `${m.pct} ${m.title}`)
    .join('\n')
/** "50 Halfway" per line → [{pct, title}]. Lines that do not start with a percentage are ignored. */
const parseMilestones = (text) =>
  normalizeMilestones(
    String(text)
      .split('\n')
      .map((l) => /^\s*(\d{1,3})\s*%?\s*(.*)$/.exec(l))
      .filter(Boolean)
      .map((m) => ({ pct: Number(m[1]), title: m[2] })),
  )

/** Create a challenge (optionally from a template) or edit one. `prefill` is a template or a copy to start from. */
export function ChallengeDialog({ open, onOpenChange, challenge, prefill, templates, habits, today, checkinCount = 0, onCreated }) {
  const [v, setV] = useState(() => blank(today))
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (!open) return
    setTouched(false)
    if (challenge)
      setV({
        ...challenge,
        target: String(challenge.target),
        habit_id: challenge.habit_id ?? '',
        milestones: milestonesText(challenge.milestones),
      })
    else if (prefill) {
      const f = challengeFromTemplate(prefill, today)
      setV({ ...blank(today), ...f, target: String(f.target), milestones: milestonesText(f.milestones), habit_id: '' })
    } else setV(blank(today))
  }, [open, challenge, prefill, today])

  const set = (patch) => setV((x) => ({ ...x, ...patch }))
  const values = useMemo(
    () => ({
      ...v,
      title: v.title.trim(),
      unit: v.unit.trim(),
      target: Number(v.target),
      habit_id: v.habit_id || null,
      milestones: parseMilestones(v.milestones),
    }),
    [v],
  )
  const problems = challengeProblems(values)
  const [save, pending] = useAction(
    async () => {
      const row = { ...values, template_key: v.template_key ?? null }
      const out = challenge ? await updateChallenge(challenge.id, row) : await createChallenge(row)
      onOpenChange(false)
      if (!challenge) onCreated?.(out)
    },
    { success: challenge ? 'Challenge updated' : 'Challenge created' },
  )
  const applyTemplate = (t) => {
    const f = challengeFromTemplate(t, v.start_date || today)
    setV({ ...v, ...f, target: String(f.target), milestones: milestonesText(f.milestones) })
  }
  const err = (k) => (touched ? problems[k] : undefined)
  const locked = !!challenge && checkinCount > 0 // the kind cannot change once there are check-ins
  const linkable = habits.filter((h) => !h.archived_at || h.id === v.habit_id)
  const unitLabel = v.kind === 'total' ? 'Total to reach' : v.kind === 'weekly' ? 'Days per week' : 'Amount per day'

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={challenge ? 'Edit challenge' : 'New challenge'}
      description={challenge ? undefined : 'A goal with a start, an end and a result.'}
      pending={pending}
      className="md:max-w-xl"
      onSubmit={(e) => {
        e.preventDefault()
        setTouched(true)
        if (!Object.keys(problems).length) save()
      }}
      submitLabel={challenge ? 'Save changes' : 'Start challenge'}
    >
      {!challenge && (
        <Field label="Start from a template (optional)">
          <Select
            value=""
            onChange={(e) => {
              const t = [...BUILT_IN_TEMPLATES, ...templates.map((x) => ({ ...x, key: null }))].find(
                (x) => (x.key ?? x.id) === e.target.value,
              )
              if (t) applyTemplate(t)
            }}
          >
            <option value="">Choose a template…</option>
            <optgroup label="Built-in">
              {BUILT_IN_TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </optgroup>
            {templates.length > 0 && (
              <optgroup label="Your templates">
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </Field>
      )}
      <Field label="Name" error={err('title')}>
        <Input
          autoFocus
          placeholder="What are you committing to?"
          maxLength={120}
          value={v.title}
          onChange={(e) => set({ title: e.target.value })}
        />
      </Field>
      <Field label="Kind" error={err('kind')} hint={CHALLENGE_KINDS.find((k) => k.key === v.kind)?.hint}>
        <div>
          <Segmented
            aria-label="Challenge kind"
            value={v.kind}
            onChange={(kind) => !locked && set({ kind, ...(kind === 'weekly' && Number(v.target) > 7 ? { target: '3' } : {}) })}
            options={KIND_OPTIONS}
          />
          {locked && <p className="mt-1 text-xs text-muted-foreground">The kind is fixed once there are check-ins.</p>}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={unitLabel} error={err('target')}>
          <Input inputMode="numeric" value={v.target} onChange={(e) => set({ target: e.target.value })} />
        </Field>
        <Field label={v.kind === 'weekly' ? 'Unit (optional)' : 'Unit, e.g. pages'} error={err('unit')}>
          <Input
            maxLength={30}
            value={v.unit}
            onChange={(e) => set({ unit: e.target.value })}
            placeholder={v.kind === 'weekly' ? '' : 'pages, km, min…'}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts" error={err('start_date')}>
          <Input type="date" clearable={false} value={v.start_date} onChange={(e) => set({ start_date: e.target.value })} />
        </Field>
        <Field label="Ends" error={err('end_date')}>
          <Input type="date" clearable={false} value={v.end_date} min={v.start_date} onChange={(e) => set({ end_date: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <Select value={v.category} onChange={(e) => set({ category: e.target.value })}>
            {[...new Set([...CHALLENGE_CATEGORIES, v.category])].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Colour" error={err('color')}>
          <div className="flex h-11 flex-wrap items-center gap-1.5 md:h-9" role="radiogroup" aria-label="Colour">
            {CHALLENGE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={v.color === c}
                aria-label={c}
                onClick={() => set({ color: c })}
                className={cn(
                  'h-5 w-5 rounded-full border-2 transition-transform',
                  v.color === c ? 'scale-110 border-foreground' : 'border-transparent',
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
      </div>
      {v.kind !== 'total' && (
        <Field
          label="Count a habit (optional)"
          error={err('habit_id')}
          hint="Days you tick that habit count as check-ins, so you never log it twice."
        >
          <Select value={v.habit_id} onChange={(e) => set({ habit_id: e.target.value })}>
            <option value="">None</option>
            {linkable.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Description (optional)" error={err('description')}>
        <Textarea rows={2} maxLength={1000} value={v.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <Field
        label="Milestones (optional)"
        hint="One per line: a percentage, then a name (e.g. “50 Halfway”). Leave empty for 25%, 50%, 75% and 100%."
      >
        <Textarea
          rows={3}
          value={v.milestones}
          onChange={(e) => set({ milestones: e.target.value })}
          placeholder={'25 First quarter\n50 Halfway'}
        />
      </Field>
    </FormDialog>
  )
}
