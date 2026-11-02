import { useEffect } from 'react'
import { GOAL_CATEGORIES, blankGoal, goalFormSchema, goalToForm, goalToPayload } from '@lifetrack/schemas'
import { PERIODS } from '@lifetrack/core/goals'
import { store } from '../../data/client'
import { useAction } from '../../hooks/useAction'
import { useZodForm } from '../../hooks/useZodForm'
import { Sheet } from '../../ui/Sheet'
import { ChipGroup, DateField } from '../../ui/controls'
import { Button, Field } from '../../ui'

export function GoalForm({ visible, goal, today, defaultPeriod = 'monthly', onClose }: { visible: boolean; goal: any | null; today: string; defaultPeriod?: 'daily' | 'weekly' | 'monthly' | 'yearly'; onClose: () => void }) {
  const { values, errors, set, reset, validate } = useZodForm(goalFormSchema, blankGoal(today, defaultPeriod))
  useEffect(() => { if (visible) reset(goal ? goalToForm(goal) : blankGoal(today, defaultPeriod)) }, [visible, goal?.id, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, pending] = useAction(async () => {
    const v = validate()
    if (!v) return
    const row = goalToPayload(v)
    if (goal) await store.update('goals', goal.id, row); else await store.insert('goals', row)
    onClose()
  })
  const cats = [...new Set([...GOAL_CATEGORIES, goal?.category])].filter(Boolean) as string[]
  return (
    <Sheet visible={visible} title={goal ? 'Edit goal' : 'New goal'} onClose={onClose} footer={<Button title={goal ? 'Save changes' : 'Create goal'} onPress={save} loading={pending} />}>
      <Field label="Goal" value={values.title} onChangeText={(t) => set('title', t)} error={errors.title} placeholder="What do you want to achieve?" autoFocus={!goal} maxLength={120} />
      <Field label="Description" value={values.notes} onChangeText={(t) => set('notes', t)} multiline numberOfLines={3} style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }} />
      <ChipGroup label="Type" value={values.period} options={PERIODS as { value: typeof values.period; label: string }[]} onChange={(v) => set('period', v)} />
      <ChipGroup label="Category" value={values.category} options={cats.map((c) => ({ value: c, label: c }))} onChange={(v) => set('category', v)} />
      <DateField label="Start date" value={values.start_date} onChange={(v) => set('start_date', v)} error={errors.start_date} clearable />
      <DateField label="Target date" value={values.due_date} onChange={(v) => set('due_date', v)} error={errors.due_date} clearable />
      <Field label="Study target (hours)" value={String(values.target_hours ?? '')} onChangeText={(t) => set('target_hours', t as unknown as number)} error={errors.target_hours} keyboardType="decimal-pad" />
      <Field label="Manual progress (%)" value={String(values.manual_progress ?? '')} onChangeText={(t) => set('manual_progress', t as unknown as number)} error={errors.manual_progress} keyboardType="number-pad" maxLength={3} />
    </Sheet>
  )
}
