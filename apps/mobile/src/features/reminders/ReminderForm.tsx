import { useEffect } from 'react'
import { View } from 'react-native'
import { REMINDER_KINDS, REPEATS, clientNowTime } from '@lifetrack/core/reminders'
import { blankReminder, reminderFormSchema, reminderToForm, reminderToPayload } from '@lifetrack/schemas'
import { timeStrInTz, todayStr } from '@lifetrack/utils'
import { api, store } from '../../data/client'
import { useAction } from '../../hooks/useAction'
import { useSettings } from '../../hooks/useSettings'
import { useZodForm } from '../../hooks/useZodForm'
import { Sheet } from '../../ui/Sheet'
import { ChipGroup, DateField, TimeField } from '../../ui/controls'
import { Button, Field } from '../../ui'

export function ReminderForm({ visible, reminder, today, onClose }: { visible: boolean; reminder: any | null; today: string; onClose: () => void }) {
  const { settings } = useSettings()
  const { values, errors, set, reset, validate } = useZodForm(reminderFormSchema, blankReminder(today))
  useEffect(() => { if (visible) reset(reminder ? reminderToForm(reminder) : blankReminder(today)) }, [visible, reminder?.id, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, pending] = useAction(async () => {
    const v = validate()
    if (!v) return
    const row = reminderToPayload(v) // saving re-arms the reminder
    if (reminder) await store.update('reminders', reminder.id, row); else await store.insert('reminders', row)
    onClose()
    // A reminder that is already due notifies immediately, as on web (an explicit action, so no grace period).
    const tz = settings.timezone
    await api.fireDueReminders(todayStr(tz), timeStrInTz(new Date(), tz), settings.notification_prefs, { tz }).catch(() => {})
  })
  return (
    <Sheet visible={visible} title={reminder ? 'Edit reminder' : 'New reminder'} onClose={onClose} footer={<Button title={reminder ? 'Save changes' : 'Set reminder'} onPress={save} loading={pending} />}>
      <Field label="Remind me to" value={values.title} onChangeText={(t) => set('title', t)} error={errors.title} placeholder="e.g. Pay electricity bill" autoFocus={!reminder} maxLength={160} />
      <ChipGroup label="Type" value={values.kind} options={REMINDER_KINDS as { value: typeof values.kind; label: string }[]} onChange={(v) => set('kind', v)} />
      <ChipGroup label="Repeat" value={values.repeat} options={REPEATS as { value: typeof values.repeat; label: string }[]} onChange={(v) => set('repeat', v)} />
      <DateField label="Date" value={values.remind_date} onChange={(v) => set('remind_date', v)} error={errors.remind_date} />
      <View style={{ flexDirection: 'row' }}><TimeField label={`Time (${settings.timezone})`} value={values.remind_time} onChange={(v) => set('remind_time', v)} error={errors.remind_time} /></View>
    </Sheet>
  )
}
