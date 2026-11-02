import { useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import { HABIT_COLORS, WEEKDAY_OPTIONS } from '@lifetrack/constants/defaults'
import { blankHabit, habitFormSchema, habitToForm } from '@lifetrack/schemas'
import { store } from '../../data/client'
import { useAction } from '../../hooks/useAction'
import { useZodForm } from '../../hooks/useZodForm'
import { useTheme } from '../../providers/ThemeProvider'
import { Sheet } from '../../ui/Sheet'
import { Chip, ChipGroup, DateField } from '../../ui/controls'
import { Button, Field } from '../../ui'

export function HabitForm({ visible, habit, today, onClose }: { visible: boolean; habit: any | null; today: string; onClose: () => void }) {
  const { colors } = useTheme()
  const { values, errors, set, reset, validate } = useZodForm(habitFormSchema, blankHabit(today, HABIT_COLORS[0]))
  useEffect(() => { if (visible) reset(habit ? habitToForm(habit) : blankHabit(today, HABIT_COLORS[0])) }, [visible, habit?.id, today]) // eslint-disable-line react-hooks/exhaustive-deps

  const [save, pending] = useAction(async () => {
    const v = validate()
    if (!v) return
    if (habit) await store.update('habits', habit.id, v) // logs are untouched: history is preserved
    else await store.insert('habits', v)
    onClose()
  })
  const days = (values.days_of_week ?? []) as number[]
  return (
    <Sheet visible={visible} title={habit ? 'Edit habit' : 'New habit'} onClose={onClose} footer={<Button title={habit ? 'Save changes' : 'Create habit'} onPress={save} loading={pending} />}>
      <Field label="Name" value={values.name} onChangeText={(t) => set('name', t)} error={errors.name} placeholder="e.g. Read 20 pages" autoFocus={!habit} maxLength={80} />
      <Field label="Description (optional)" value={values.description} onChangeText={(t) => set('description', t)} maxLength={300} />
      <ChipGroup label="Repeats" value={values.frequency} options={[{ value: 'daily', label: 'Every day' }, { value: 'custom', label: 'Specific days' }, { value: 'weekly', label: 'X times a week' }]} onChange={(v) => set('frequency', v)} />
      {values.frequency === 'custom' ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.foreground, fontWeight: '500' }}>Days</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(WEEKDAY_OPTIONS as [string, number][]).map(([label, n]) => <Chip key={n} label={label} selected={days.includes(n)} onPress={() => set('days_of_week', days.includes(n) ? days.filter((x) => x !== n) : [...days, n])} />)}
          </View>
          {errors.days_of_week ? <Text style={{ color: colors.danger, fontSize: 13 }}>{errors.days_of_week}</Text> : null}
        </View>
      ) : null}
      {values.frequency === 'weekly' ? <Field label="Times per week" value={String(values.weekly_target ?? '')} onChangeText={(t) => set('weekly_target', t as unknown as number)} error={errors.weekly_target} keyboardType="number-pad" maxLength={1} /> : null}
      <DateField label="Start date" value={values.start_date} onChange={(v) => set('start_date', v)} error={errors.start_date} />
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.foreground, fontWeight: '500' }}>Colour</Text>
        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
          {HABIT_COLORS.map((c: string) => (
            <Pressable key={c} accessibilityRole="button" accessibilityLabel={`Colour ${c}`} accessibilityState={{ selected: values.color === c }} onPress={() => set('color', c)} hitSlop={6}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c, borderWidth: values.color === c ? 3 : 0, borderColor: colors.foreground }} />
          ))}
        </View>
      </View>
    </Sheet>
  )
}
