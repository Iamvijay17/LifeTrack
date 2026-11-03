import { describe, expect, it } from 'vitest'
import { DELETE_CONFIRM_WORD, displayNameSchema, focusPrefsFormSchema, passwordChangeSchema, preferencesFormSchema, preferencesToForm, preferencesToPayload, updateSchemas } from '../src'

const settings = { timezone: 'Asia/Kolkata', currency: 'INR', week_starts_on: 1, daily_study_target_minutes: 120, monthly_budget_paise: 3000000, water_goal_ml: 3000, steps_goal: 8000 }
describe('preferences', () => {
  it('round-trips settings through the form (budget in rupees, week start as string)', () => {
    const f = preferencesToForm(settings)
    expect(f).toMatchObject({ monthly_budget: '30000', week_starts_on: '1' })
    const p = preferencesToPayload(preferencesFormSchema.parse(f))
    expect(p).toMatchObject({ monthly_budget_paise: 3000000, week_starts_on: 1, water_goal_ml: 3000 })
    expect(p).not.toHaveProperty('monthly_budget')
    expect(updateSchemas.user_settings.safeParse(p).success).toBe(true)
    expect(preferencesToPayload(preferencesFormSchema.parse({ ...f, monthly_budget: '' })).monthly_budget_paise).toBe(0)
  })
  it('rejects bad values', () => {
    const f = preferencesToForm(settings)
    for (const bad of [{ timezone: 'Mars/Base' }, { currency: 'GBP' }, { week_starts_on: '2' }, { daily_study_target_minutes: 1441 }, { monthly_budget: 'lots' }, { water_goal_ml: 20001 }, { steps_goal: -1 }]) expect(preferencesFormSchema.safeParse({ ...f, ...bad }).success, JSON.stringify(bad)).toBe(false)
  })
})
describe('focus prefs, name, password', () => {
  it('focus prefs bounds with friendly messages', () => {
    expect(focusPrefsFormSchema.parse({ short_break: '5', long_break: '15', long_every: '4' })).toEqual({ short_break: 5, long_break: 15, long_every: 4 })
    const bad = focusPrefsFormSchema.safeParse({ short_break: '61', long_break: '15', long_every: '1' })
    expect(bad.success).toBe(false)
    expect(!bad.success && bad.error.issues.map((i) => i.message)).toEqual(['Short break: 1–60 minutes.', 'Long break every: 2–10 sessions.'])
    expect(focusPrefsFormSchema.safeParse({ short_break: '2.5', long_break: '15', long_every: '4' }).success).toBe(false)
    expect(updateSchemas.user_settings.safeParse({ focus_prefs: { short_break: 5, long_break: 15, long_every: 4 } }).success).toBe(true)
  })
  it('display name and password change', () => {
    expect(displayNameSchema.safeParse('  ').success).toBe(false)
    expect(displayNameSchema.safeParse('x'.repeat(81)).success).toBe(false)
    expect(displayNameSchema.parse('  Vijay ')).toBe('Vijay')
    expect(passwordChangeSchema.safeParse({ a: 'short', b: 'short' }).success).toBe(false)
    expect(passwordChangeSchema.safeParse({ a: 'longenough', b: 'different1' }).success).toBe(false)
    expect(passwordChangeSchema.safeParse({ a: 'longenough', b: 'longenough' }).success).toBe(true)
    expect(DELETE_CONFIRM_WORD).toBe('DELETE')
  })
})

import { blankReminder, insertSchemas, reminderFormSchema, reminderToForm, reminderToPayload } from '../src'
describe('reminder form', () => {
  it('validates and re-arms on save', () => {
    expect(reminderFormSchema.safeParse(blankReminder('2026-11-02')).success).toBe(false)
    expect(reminderFormSchema.safeParse({ ...blankReminder('2026-11-02'), title: 'x', remind_time: '9:00' }).success).toBe(false)
    expect(reminderFormSchema.safeParse({ ...blankReminder('2026-02-30'), title: 'x' }).success).toBe(false)
    const p = reminderToPayload(reminderFormSchema.parse({ ...blankReminder('2026-11-02'), title: ' Pay rent ', kind: 'bill', repeat: 'monthly' }))
    expect(p).toMatchObject({ title: 'Pay rent', active: true, last_fired_on: null, kind: 'bill' })
    expect(insertSchemas.reminders.safeParse(p).success).toBe(true)
    expect(reminderToForm({ kind: 'task', title: 'a', remind_date: '2026-11-02', remind_time: '09:00:00', repeat: 'none' }).remind_time).toBe('09:00')
  })
})
