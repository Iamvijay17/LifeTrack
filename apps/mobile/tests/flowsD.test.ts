import { describe, expect, it } from 'vitest'
import { dashboardData, isWidgetOn } from '@lifetrack/core/dashboard'
import { validateScoreWeights } from '@lifetrack/core/score'
import { blankTask, focusPrefsFormSchema, preferencesFormSchema, preferencesToForm, preferencesToPayload, taskFormSchema, taskFormToPayload } from '@lifetrack/schemas'
import { setup } from './helpers'

const TODAY = '2026-11-02'
const settings = { timezone: 'Asia/Kolkata', currency: 'INR', week_starts_on: 1, daily_study_target_minutes: 0, water_goal_ml: 0, steps_goal: 0, monthly_budget_paise: 0, workout_plan: {}, score_weights: { learning: 25, career: 25, fitness: 20, habits: 15, health: 15 } }
const empty = { tasks: [], studySessions: [], workouts: [], healthLogs: [], transactions: [], applications: [], history: [], interviews: [], goals: [], milestones: [], habits: [], habitLogs: [] }

describe('dashboard + quick actions', () => {
  it('quick-add task → priority list → complete from the dashboard; progress follows real data', async () => {
    const { store, api, tables } = setup()
    await store.load('tasks')
    await api.createTask(taskFormToPayload(taskFormSchema.parse({ ...blankTask(TODAY), title: 'Pay rent', priority: 'high' })))
    const view = () => dashboardData({ ...empty, tasks: store.peek('tasks') as any }, { settings, today: TODAY })
    expect(view().topTasks.map((t: any) => t.title)).toEqual(['Pay rent'])
    expect(view().progress.percent).toBe(0)
    await api.setTaskStatus(tables.tasks[0], 'done', TODAY)
    expect(view().topTasks).toEqual([])
    expect(view().progress.percent).toBe(100)
    expect(view().doneTodayTasks).toBe(1)
  })
  it('quick start-study: one timer at a time, and it shows as running on the dashboard', async () => {
    const { store, api } = setup()
    await store.load('study_sessions')
    await api.startStudy({}, TODAY)
    await expect(api.startStudy({}, TODAY)).rejects.toThrow(/already running/)
    expect(dashboardData({ ...empty, studySessions: store.peek('study_sessions') as any }, { settings, today: TODAY }).timerRunning).toBe(true)
  })
  it('hiding a widget is saved on the account and survives a re-read; new widgets default to visible', async () => {
    const { store, tables } = setup()
    await store.load('user_settings')
    await store.upsert('user_settings', { dashboard_widgets: { activity: false } }, { onConflict: 'user_id' })
    await store.upsert('user_settings', { dashboard_widgets: { activity: false, quick: false } }, { onConflict: 'user_id' })
    expect(tables.user_settings).toHaveLength(1)
    const prefs = tables.user_settings[0].dashboard_widgets
    expect([isWidgetOn(prefs, 'activity'), isWidgetOn(prefs, 'quick'), isWidgetOn(prefs, 'score'), isWidgetOn(prefs, 'future-widget')]).toEqual([false, false, true, true])
  })
})

describe('settings', () => {
  it('saves preferences as a valid user_settings update (budget → paise, week start → number)', async () => {
    const { store, tables } = setup()
    await store.load('user_settings')
    const v = preferencesFormSchema.parse({ ...preferencesToForm({ ...settings, daily_study_target_minutes: 120, water_goal_ml: 3000, steps_goal: 8000 }), monthly_budget: '30,000', week_starts_on: '0', currency: 'USD' })
    await store.upsert('user_settings', preferencesToPayload(v), { onConflict: 'user_id' })
    expect(tables.user_settings[0]).toMatchObject({ monthly_budget_paise: 3000000, week_starts_on: 0, currency: 'USD', water_goal_ml: 3000 })
  })
  it('theme, score weights and focus prefs are saved on the account; invalid values never reach the database', async () => {
    const { store, tables } = setup()
    await store.load('user_settings')
    await store.upsert('user_settings', { theme: 'light' }, { onConflict: 'user_id' })
    await store.upsert('user_settings', { score_weights: validateScoreWeights({ learning: '40', career: 10, fitness: 20, habits: 15, health: 15 }) }, { onConflict: 'user_id' })
    await store.upsert('user_settings', { focus_prefs: focusPrefsFormSchema.parse({ short_break: '10', long_break: '20', long_every: '3' }) }, { onConflict: 'user_id' })
    expect(tables.user_settings).toHaveLength(1)
    expect(tables.user_settings[0]).toMatchObject({ theme: 'light', score_weights: { learning: 40 }, focus_prefs: { short_break: 10, long_break: 20, long_every: 3 } })
    await expect(store.upsert('user_settings', { theme: 'neon' }, { onConflict: 'user_id' })).rejects.toThrow(/Invalid upsert payload/)
    await expect(store.upsert('user_settings', { water_goal_ml: 999999 }, { onConflict: 'user_id' })).rejects.toThrow(/Invalid upsert payload/)
  })
  it('display name update keeps profiles in step', async () => {
    const { store, tables } = setup()
    const p = await store.insert('profiles', { display_name: 'Old' }) as any
    await store.update('profiles', p.id, { display_name: 'Vijay' })
    expect(tables.profiles[0].display_name).toBe('Vijay')
    await expect(store.update('profiles', p.id, { display_name: 'x'.repeat(81) })).rejects.toThrow(/Invalid update payload/)
  })
})
