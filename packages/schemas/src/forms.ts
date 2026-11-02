import { z } from 'zod'
import { dateStrInTz, isValidDay, lpaToPaise, paiseToInput, paiseToLpa, parseMoney, parseTags, sleepMinutes, timeStrInTz, zonedToIso } from '@lifetrack/utils'
import { TASK_CATEGORIES } from './tables'

// Form-level validation + payload mapping shared by web and mobile. Forms hold strings ('' = empty);
// *ToPayload converts them to the exact shape the database accepts (validated in tests against insertSchemas).

const day = z.string().refine((v) => v === '' || isValidDay(v), 'Enter a valid date')

// ------------------------------------------------------------------- tasks
export const taskFormSchema = z.object({
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
export type TaskForm = z.infer<typeof taskFormSchema>

export const blankTask = (defaultDate = ''): TaskForm => ({ title: '', notes: '', category: 'Personal', priority: 'medium', due_date: defaultDate, recurrence: 'none', recurrence_until: '' })
export const taskToForm = (t: { title: string; notes?: string | null; category: TaskForm['category']; priority: TaskForm['priority']; due_date?: string | null; recurrence: TaskForm['recurrence']; recurrence_until?: string | null }): TaskForm =>
  ({ title: t.title, notes: t.notes ?? '', category: t.category, priority: t.priority, due_date: t.due_date ?? '', recurrence: t.recurrence, recurrence_until: t.recurrence_until ?? '' })
export const taskFormToPayload = (v: TaskForm) =>
  ({ ...v, due_date: v.due_date || null, recurrence_until: v.recurrence === 'none' ? null : v.recurrence_until || null })

// ------------------------------------------------------------------ habits
export const habitFormSchema = z.object({
  name: z.string().trim().min(1, 'Name your habit').max(80),
  description: z.string().max(300),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  frequency: z.enum(['daily', 'weekly', 'custom']),
  days_of_week: z.array(z.number()),
  weekly_target: z.coerce.number().int().min(1, 'At least 1').max(7, 'At most 7'),
  start_date: z.string().refine(isValidDay, 'Pick a start date'),
}).refine((v) => v.frequency !== 'custom' || v.days_of_week.length > 0, { path: ['days_of_week'], message: 'Pick at least one day' })
export type HabitForm = z.input<typeof habitFormSchema>

export const blankHabit = (today: string, color: string): HabitForm => ({ name: '', description: '', color, frequency: 'daily', days_of_week: [], weekly_target: 3, start_date: today })
export const habitToForm = (h: { name: string; description?: string | null; color: string; frequency: HabitForm['frequency']; days_of_week?: number[] | null; weekly_target: number; start_date: string }): HabitForm =>
  ({ name: h.name, description: h.description ?? '', color: h.color, frequency: h.frequency, days_of_week: h.days_of_week ?? [], weekly_target: h.weekly_target, start_date: h.start_date })

// ----------------------------------------------------------- study sessions
/** Manual study entry. `today` is injected so "no future dates" is evaluated in the user's timezone. */
export const sessionFormSchema = (today: string) => z.object({
  target: z.string(),
  session_date: z.string().refine(isValidDay, 'Pick a date').refine((v) => v <= today, "You can't log study time in the future"),
  minutes: z.coerce.number({ invalid_type_error: 'Enter minutes' }).min(0).max(1440, 'Max 24h per entry'),
  problems_solved: z.coerce.number().int().min(0),
  notes: z.string().max(1000),
}).refine((v) => v.minutes > 0 || v.problems_solved > 0, { path: ['minutes'], message: 'Enter minutes studied or problems solved' })
export type SessionForm = z.input<ReturnType<typeof sessionFormSchema>>

export const blankSession = (today: string): SessionForm => ({ target: '', session_date: today, minutes: '' as unknown as number, problems_solved: 0, notes: '' })
export const sessionToForm = (s: { goal_id?: string | null; topic_id?: string | null; session_date: string; duration_seconds?: number | null; problems_solved: number; notes?: string | null }): SessionForm =>
  ({ target: s.goal_id ? `g:${s.goal_id}` : s.topic_id ? `t:${s.topic_id}` : '', session_date: s.session_date, minutes: Math.round((s.duration_seconds ?? 0) / 60), problems_solved: s.problems_solved, notes: s.notes ?? '' })
/** `target` = { goal_id, topic_id } resolved by core's parseStudyTarget. New sessions get started/ended timestamps. */
export const sessionFormToPayload = (v: { session_date: string; minutes: number; problems_solved: number; notes: string }, target: { goal_id: string | null; topic_id: string | null }, existing: boolean, nowIso = new Date().toISOString()) => {
  const row = { ...target, session_date: v.session_date, duration_seconds: Math.round(v.minutes * 60), problems_solved: v.problems_solved, notes: v.notes, status: 'completed' as const }
  return existing ? row : { ...row, source: 'manual' as const, started_at: nowIso, ended_at: nowIso }
}

// ------------------------------------------------------------ learning goals
export const learningGoalFormSchema = z.object({
  title: z.string().trim().min(1, 'Name the goal').max(120),
  topic_id: z.string(),
  target_hours: z.coerce.number({ invalid_type_error: 'Enter hours' }).min(0).max(5000),
  due_date: day,
  status: z.enum(['active', 'completed', 'archived']),
  notes: z.string().max(1000),
})
export type LearningGoalForm = z.input<typeof learningGoalFormSchema>
export const blankLearningGoal = (): LearningGoalForm => ({ title: '', topic_id: '', target_hours: 20, due_date: '', status: 'active', notes: '' })
export const learningGoalToForm = (g: { title: string; topic_id?: string | null; target_minutes: number; due_date?: string | null; status: LearningGoalForm['status']; notes?: string | null }): LearningGoalForm =>
  ({ title: g.title, topic_id: g.topic_id ?? '', target_hours: g.target_minutes / 60, due_date: g.due_date ?? '', status: g.status, notes: g.notes ?? '' })
export const learningGoalToPayload = (v: z.output<typeof learningGoalFormSchema>, topics: { id: string; group_name: string }[]) => {
  const topic = topics.find((t) => t.id === v.topic_id)
  return { title: v.title, topic_id: v.topic_id || null, category: topic?.group_name ?? 'Learning', target_minutes: Math.round(v.target_hours * 60), due_date: v.due_date || null, status: v.status, notes: v.notes }
}

// --------------------------------------------------------------------- topics
export const topicFormSchema = z.object({
  group_name: z.string().trim().min(1, 'Pick a category'),
  name: z.string().trim().min(1, 'Name the topic').max(80),
  notes: z.string().max(5000),
  revision_dates: z.string(),
})
export type TopicForm = z.input<typeof topicFormSchema>
export const blankTopic = (group: string): TopicForm => ({ group_name: group, name: '', notes: '', revision_dates: '' })
export const topicToForm = (t: { group_name: string; name: string; notes?: string | null; revision_dates?: string[] | null }): TopicForm =>
  ({ group_name: t.group_name, name: t.name, notes: t.notes ?? '', revision_dates: (t.revision_dates ?? []).join(', ') })
export const topicToPayload = (v: z.output<typeof topicFormSchema>, revisionDates: string[]) => ({ group_name: v.group_name, name: v.name, notes: v.notes, revision_dates: revisionDates })

// ---------------------------------------------------------------------- goals
export const GOAL_CATEGORIES = ['Learning', 'Career', 'Fitness', 'Health', 'Finance', 'Personal'] as const
export const GOAL_PERIODS = ['daily', 'weekly', 'monthly', 'yearly'] as const
export const goalFormSchema = z.object({
  title: z.string().trim().min(1, 'Name the goal').max(120, 'Keep it under 120 characters'),
  notes: z.string().max(2000),
  category: z.string().min(1),
  period: z.enum(GOAL_PERIODS),
  start_date: day,
  due_date: day,
  target_hours: z.coerce.number({ invalid_type_error: 'Enter hours' }).min(0).max(5000),
  manual_progress: z.coerce.number({ invalid_type_error: 'Enter 0–100' }).int().min(0).max(100),
}).refine((v) => !v.start_date || !v.due_date || v.due_date >= v.start_date, { path: ['due_date'], message: 'Target date must be on or after the start date' })
export type GoalForm = z.input<typeof goalFormSchema>
export const blankGoal = (today = '', period: GoalForm['period'] = 'monthly'): GoalForm => ({ title: '', notes: '', category: 'Personal', period, start_date: today, due_date: '', target_hours: 0, manual_progress: 0 })
export const goalToForm = (g: { title: string; notes?: string | null; category: string; period: GoalForm['period']; start_date?: string | null; due_date?: string | null; target_minutes?: number | null; manual_progress?: number | null }): GoalForm =>
  ({ title: g.title, notes: g.notes ?? '', category: g.category, period: g.period, start_date: g.start_date ?? '', due_date: g.due_date ?? '', target_hours: (g.target_minutes ?? 0) / 60, manual_progress: g.manual_progress ?? 0 })
export const goalToPayload = (v: z.output<typeof goalFormSchema>) =>
  ({ title: v.title.trim(), notes: v.notes, category: v.category, period: v.period, start_date: v.start_date || null, due_date: v.due_date || null, target_minutes: Math.round(v.target_hours * 60), manual_progress: v.manual_progress })

export const milestoneFormSchema = z.object({
  title: z.string().trim().min(1, 'Name the milestone first.').max(160),
  due_date: z.string().refine((v) => v === '' || isValidDay(v), 'Enter a valid date.'),
})

// ------------------------------------------------------------------- health
const hhmm = z.string().refine((v) => v === '' || /^\d{2}:\d{2}$/.test(v), 'Use HH:MM')
const numRange = (min: number, max: number, label: string) =>
  z.string().refine((v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max), `${label}: ${min}–${max}`)
export const healthFormSchema = z.object({
  bedtime: hhmm, wake_time: hhmm, water_ml: numRange(0, 20000, 'Water'), steps: numRange(0, 200000, 'Steps'),
  energy_level: z.string(), weight_kg: numRange(20, 500, 'Weight'), notes: z.string().max(1000),
}).superRefine((v, ctx) => {
  if (!!v.bedtime !== !!v.wake_time) ctx.addIssue({ code: 'custom', path: [v.bedtime ? 'wake_time' : 'bedtime'], message: 'Enter both bedtime and wake-up time' })
  if (v.bedtime && v.wake_time && sleepMinutes(v.bedtime, v.wake_time) == null) ctx.addIssue({ code: 'custom', path: ['wake_time'], message: 'Bedtime and wake-up time can’t be identical' })
})
export type HealthForm = z.infer<typeof healthFormSchema>
export const healthToForm = (h?: { bedtime?: string | null; wake_time?: string | null; water_ml?: number | null; steps?: number | null; energy_level?: number | null; weight_kg?: number | string | null; notes?: string | null } | null): HealthForm =>
  ({ bedtime: h?.bedtime?.slice(0, 5) ?? '', wake_time: h?.wake_time?.slice(0, 5) ?? '', water_ml: h ? String(h.water_ml ?? 0) : '', steps: h ? String(h.steps ?? 0) : '', energy_level: h?.energy_level ? String(h.energy_level) : '', weight_kg: h?.weight_kg != null ? String(h.weight_kg) : '', notes: h?.notes ?? '' })
export const healthFormToPayload = (v: HealthForm) => {
  const n = (s: string) => (s === '' ? null : Number(s))
  return {
    bedtime: v.bedtime || null, wake_time: v.wake_time || null, sleep_minutes: v.bedtime ? sleepMinutes(v.bedtime, v.wake_time) : null,
    water_ml: n(v.water_ml) ?? 0, steps: n(v.steps) ?? 0, energy_level: n(v.energy_level), weight_kg: n(v.weight_kg), notes: v.notes,
  }
}

// -------------------------------------------------------------------- notes
export const noteFormSchema = z.object({
  title: z.string().trim().max(160, 'Keep the title under 160 characters'),
  body: z.string().max(20000, 'Notes can be up to 20,000 characters'),
  category: z.string().trim().min(1, 'Pick a category').max(40),
  tags: z.string().max(200),
  pinned: z.boolean(),
  goal_id: z.string(),
  task_id: z.string(),
}).refine((v) => v.title || v.body.trim(), { path: ['body'], message: 'Write a title or some content' })
export type NoteForm = z.infer<typeof noteFormSchema>
export const blankNote = (): NoteForm => ({ title: '', body: '', category: 'General', tags: '', pinned: false, goal_id: '', task_id: '' })
export const noteToForm = (n: { title: string; body: string; category: string; tags?: string[] | null; pinned: boolean; goal_id?: string | null; task_id?: string | null }): NoteForm =>
  ({ title: n.title, body: n.body, category: n.category, tags: (n.tags ?? []).join(', '), pinned: n.pinned, goal_id: n.goal_id ?? '', task_id: n.task_id ?? '' })
export const noteToPayload = (v: NoteForm) =>
  ({ title: v.title.trim(), body: v.body, category: v.category.trim(), tags: parseTags(v.tags), pinned: v.pinned, goal_id: v.goal_id || null, task_id: v.task_id || null })

export const journalFormSchema = z.object({
  mood: z.number().int().min(1).max(5).nullable(),
  content: z.string().max(20000),
  wins: z.string().max(5000),
})

// ------------------------------------------------------------------ finance
export const TX_TYPES = ['expense', 'income', 'savings'] as const
export const TX_PAYMENT_METHODS = ['Cash', 'UPI', 'Credit card', 'Debit card', 'Bank transfer', 'Other'] as const
export const transactionFormSchema = z.object({
  type: z.enum(TX_TYPES),
  amount: z.string().trim().refine((v) => { const p = parseMoney(v); return p !== null && p > 0 }, 'Enter an amount greater than 0 (max 2 decimals)'),
  category: z.string().min(1, 'Choose a category'),
  txn_date: z.string().refine(isValidDay, 'Pick a date'),
  payment_method: z.enum(TX_PAYMENT_METHODS),
  note: z.string().max(300),
})
export type TransactionForm = z.infer<typeof transactionFormSchema>
export const blankTransaction = (type: TransactionForm['type'], firstCategory: string, today: string): TransactionForm => ({ type, amount: '', category: firstCategory, txn_date: today, payment_method: 'UPI', note: '' })
export const transactionToForm = (t: { type: TransactionForm['type']; amount_paise: number; category: string; txn_date: string; payment_method?: string | null; note?: string | null }): TransactionForm =>
  ({ type: t.type, amount: paiseToInput(t.amount_paise), category: t.category, txn_date: t.txn_date, payment_method: (t.payment_method ?? 'Other') as TransactionForm['payment_method'], note: t.note ?? '' })
export const transactionToPayload = (v: TransactionForm) =>
  ({ type: v.type, amount_paise: parseMoney(v.amount) as number, category: v.category, txn_date: v.txn_date, payment_method: v.payment_method, note: v.note })

const money = (label: string, min = 1) => z.string().trim().refine((v) => { const p = parseMoney(v); return p !== null && p >= min }, `Enter a valid ${label}`)
export const savingsGoalFormSchema = z.object({
  name: z.string().trim().min(1, 'Name the goal').max(80, 'Keep it under 80 characters'),
  target: money('target amount (more than 0)'),
  saved: z.string().trim().refine((v) => v === '' || parseMoney(v) !== null, 'Enter a valid amount'),
  target_date: z.string().refine((v) => v === '' || isValidDay(v), 'Enter a valid date'),
})
export type SavingsGoalForm = z.infer<typeof savingsGoalFormSchema>
export const blankSavingsGoal = (): SavingsGoalForm => ({ name: '', target: '', saved: '', target_date: '' })
export const savingsGoalToForm = (g: { name: string; target_paise: number; saved_paise: number; target_date?: string | null }): SavingsGoalForm =>
  ({ name: g.name, target: paiseToInput(g.target_paise), saved: paiseToInput(g.saved_paise), target_date: g.target_date ?? '' })
export const savingsGoalToPayload = (v: SavingsGoalForm) =>
  ({ name: v.name.trim(), target_paise: parseMoney(v.target) as number, saved_paise: v.saved ? (parseMoney(v.saved) as number) : 0, target_date: v.target_date || null })

/** Parse a typed money amount for the budget / add-funds inputs; returns paise or throws a friendly Error. */
export function parseAmountOrThrow(input: string, message: string, { allowZero = false } = {}): number {
  const p = parseMoney(input)
  if (p === null || (!allowZero && p <= 0)) throw new Error(message)
  return p
}

// --------------------------------------------------------------------- jobs
export const APPLICATION_STATUSES = ['interested', 'preparing', 'applied', 'assessment', 'interview', 'selected', 'offer', 'rejected', 'withdrawn'] as const
export const applicationFormSchema = z.object({
  company: z.string().trim().min(1, 'Company is required').max(120),
  job_title: z.string().trim().min(1, 'Job title is required').max(120),
  jd_url: z.string().trim().refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Must start with http:// or https://'),
  location: z.string().max(120),
  salary_lpa: z.string().refine((v) => v.trim() === '' || parseMoney(v) !== null, 'Enter a number like 12 or 18.5'),
  applied_date: day,
  source: z.string().max(60),
  status: z.enum(APPLICATION_STATUSES),
  contact_person: z.string().max(120),
  followup_date: day,
  resume_version: z.string().max(80),
  notes: z.string().max(4000),
})
export type ApplicationForm = z.infer<typeof applicationFormSchema>
export const blankApplication = (status: ApplicationForm['status'] = 'interested', today = ''): ApplicationForm =>
  ({ company: '', job_title: '', jd_url: '', location: '', salary_lpa: '', applied_date: status === 'applied' ? today : '', source: '', status, contact_person: '', followup_date: '', resume_version: '', notes: '' })
export const applicationToForm = (a: Partial<Record<keyof ApplicationForm, string | null>> & { salary_paise?: number | null }): ApplicationForm => {
  const b = blankApplication()
  const out = Object.fromEntries((Object.keys(b) as (keyof ApplicationForm)[]).map((k) => [k, (a[k] as string | null | undefined) ?? ''])) as ApplicationForm
  return { ...out, salary_lpa: a.salary_paise != null ? String(paiseToLpa(a.salary_paise)) : '' }
}
export const applicationToPayload = (v: ApplicationForm) => {
  const { salary_lpa, ...rest } = v
  return { ...rest, applied_date: v.applied_date || null, followup_date: v.followup_date || null, salary_paise: salary_lpa.trim() ? lpaToPaise(salary_lpa) : null }
}

export const INTERVIEW_MODES = ['video', 'phone', 'onsite', 'other'] as const
export const interviewFormSchema = z.object({
  application_id: z.string().min(1, 'Choose an application'),
  round_name: z.string().trim().min(1, 'Name the round').max(80),
  date: z.string().refine(isValidDay, 'Pick a date'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Pick a time'),
  mode: z.enum(INTERVIEW_MODES),
  link: z.string().max(500),
  status: z.enum(['scheduled', 'completed', 'cancelled']),
  notes: z.string().max(2000),
})
export type InterviewForm = z.infer<typeof interviewFormSchema>
export const blankInterview = (applicationId: string, today: string): InterviewForm => ({ application_id: applicationId, round_name: 'Technical round', date: today, time: '11:00', mode: 'video', link: '', status: 'scheduled', notes: '' })
export const interviewToForm = (e: { application_id: string; round_name: string; scheduled_at: string; mode: InterviewForm['mode']; link?: string | null; status: InterviewForm['status']; notes?: string | null }, tz: string): InterviewForm =>
  ({ application_id: e.application_id, round_name: e.round_name, date: dateStrInTz(e.scheduled_at, tz), time: timeStrInTz(e.scheduled_at, tz), mode: e.mode, link: e.link ?? '', status: e.status, notes: e.notes ?? '' })
export const interviewToPayload = (v: InterviewForm, tz: string) => {
  const { date, time, ...rest } = v
  return { ...rest, scheduled_at: zonedToIso(date, time, tz) }
}

// ------------------------------------------------------------------ fitness
const nonNeg = (max: number, label: string) => z.coerce.number({ invalid_type_error: `${label}: enter a number` }).min(0, `${label} can’t be negative`).max(max, `${label} is too large`)
const optNum = (max: number, label: string) => z.union([z.literal(''), nonNeg(max, label)])

export const exerciseFormSchema = z.object({ name: z.string().trim().min(1, 'Name the exercise').max(80), muscle_group: z.string(), equipment: z.string().max(60) })
export const blankExercise = () => ({ name: '', muscle_group: 'Chest', equipment: '' })

export const routineFormSchema = z.object({
  name: z.string().trim().min(1, 'Name the routine').max(80),
  notes: z.string().max(1000),
  exercises: z.array(z.object({ name: z.string().trim().min(1, 'Exercise name'), sets: nonNeg(20, 'Sets'), reps: nonNeg(1000, 'Reps'), weight_kg: nonNeg(1000, 'Weight') })).min(1, 'Add at least one exercise'),
})
export type RoutineForm = z.input<typeof routineFormSchema>
export const blankRoutine = (): RoutineForm => ({ name: '', notes: '', exercises: [{ name: '', sets: 3, reps: 10, weight_kg: 0 }] })

export const workoutFormSchema = z.object({
  workout_date: z.string().refine(isValidDay, 'Pick a date'),
  routine_id: z.string(),
  name: z.string().trim().min(1, 'Name the workout').max(80),
  kind: z.enum(['strength', 'cardio', 'mixed', 'other']),
  duration_minutes: optNum(1440, 'Duration'),
  cardio_minutes: optNum(1440, 'Cardio minutes'),
  cardio_distance_km: optNum(1000, 'Distance'),
  notes: z.string().max(2000),
  exercises: z.array(z.object({ name: z.string().trim().min(1, 'Exercise name'), sets: z.array(z.object({ reps: nonNeg(1000, 'Reps'), weight: nonNeg(1000, 'Weight') })) })),
})
export type WorkoutForm = z.input<typeof workoutFormSchema>
export const blankWorkout = (date: string): WorkoutForm => ({ workout_date: date, routine_id: '', name: 'Workout', kind: 'strength', duration_minutes: '', cardio_minutes: '', cardio_distance_km: '', notes: '', exercises: [] })
export const workoutToForm = (w: { workout_date: string; routine_id?: string | null; name: string; kind: WorkoutForm['kind']; duration_minutes?: number | null; cardio_minutes?: number | null; cardio_distance_km?: number | null; notes?: string | null }, exercises: WorkoutForm['exercises']): WorkoutForm =>
  ({ workout_date: w.workout_date, routine_id: w.routine_id ?? '', name: w.name, kind: w.kind, duration_minutes: w.duration_minutes ?? '', cardio_minutes: w.cardio_minutes ?? '', cardio_distance_km: w.cardio_distance_km ?? '', notes: w.notes ?? '', exercises })
/** The workouts row (set rows are built by core's workoutRows). */
export const workoutFormToPayload = (v: z.output<typeof workoutFormSchema>) => {
  const n = (x: number | '') => (x === '' ? null : Number(x))
  return { workout_date: v.workout_date, routine_id: v.routine_id || null, name: v.name, kind: v.kind, status: 'completed' as const, duration_minutes: n(v.duration_minutes), cardio_minutes: n(v.cardio_minutes), cardio_distance_km: n(v.cardio_distance_km), notes: v.notes }
}

export const measurementFormSchema = (() => {
  const o = optNum
  return z.object({ measured_on: z.string().refine(isValidDay, 'Pick a date'), weight_kg: z.union([z.literal(''), z.coerce.number().min(20).max(500)]), chest_cm: o(300, 'Chest'), waist_cm: o(300, 'Waist'), hips_cm: o(300, 'Hips'), arm_cm: o(150, 'Arm'), thigh_cm: o(200, 'Thigh'), body_fat_pct: o(80, 'Body fat'), notes: z.string().max(500) })
})()
export type MeasurementForm = z.input<typeof measurementFormSchema>
export const blankMeasurement = (today: string): MeasurementForm => ({ measured_on: today, weight_kg: '', chest_cm: '', waist_cm: '', hips_cm: '', arm_cm: '', thigh_cm: '', body_fat_pct: '', notes: '' })
/** Splits one form into the body_measurements row (or null if no tape measurements) and the weight to log in health_logs (or null). Throws if empty. */
export function measurementFormToPayloads(v: z.output<typeof measurementFormSchema>) {
  const n = (x: number | '') => (x === '' ? null : Number(x))
  const { weight_kg, measured_on, notes, ...rest } = v
  const tape = Object.fromEntries(Object.entries(rest).map(([k, x]) => [k, n(x as number | '')]))
  const hasTape = Object.values(tape).some((x) => x != null)
  if (!hasTape && weight_kg === '') throw new Error('Enter at least one measurement.')
  return { body: hasTape ? { measured_on, notes, ...tape } : null, weight: weight_kg === '' ? null : Number(weight_kg), date: measured_on }
}

// ----------------------------------------------------------------- settings
const validTz = (tz: string) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false } }
export const CURRENCY_CODES = ['INR', 'USD', 'EUR'] as const
export const preferencesFormSchema = z.object({
  timezone: z.string().refine(validTz, 'Unknown timezone'),
  currency: z.enum(CURRENCY_CODES),
  week_starts_on: z.coerce.number().refine((n) => n === 0 || n === 1),
  daily_study_target_minutes: z.coerce.number({ invalid_type_error: 'Enter minutes' }).int().min(0).max(1440, 'Max 1440'),
  monthly_budget: z.string().refine((v) => v.trim() === '' || parseMoney(v) !== null, 'Enter an amount like 30000'),
  water_goal_ml: z.coerce.number().int().min(0).max(20000),
  steps_goal: z.coerce.number().int().min(0).max(200000),
})
export type PreferencesForm = z.input<typeof preferencesFormSchema>
export const preferencesToForm = (s: { timezone: string; currency: string; week_starts_on: number; daily_study_target_minutes: number; monthly_budget_paise: number; water_goal_ml: number; steps_goal: number }): PreferencesForm =>
  ({ timezone: s.timezone, currency: s.currency as PreferencesForm['currency'], week_starts_on: String(s.week_starts_on) as unknown as number, daily_study_target_minutes: s.daily_study_target_minutes, monthly_budget: s.monthly_budget_paise ? paiseToInput(s.monthly_budget_paise) : '', water_goal_ml: s.water_goal_ml, steps_goal: s.steps_goal })
export const preferencesToPayload = (v: z.output<typeof preferencesFormSchema>) => {
  const { monthly_budget, ...rest } = v
  return { ...rest, monthly_budget_paise: monthly_budget.trim() ? (parseMoney(monthly_budget) as number) : 0 }
}

export const focusPrefsFormSchema = z.object({
  short_break: z.coerce.number().int('Short break: 1–60 minutes.').min(1, 'Short break: 1–60 minutes.').max(60, 'Short break: 1–60 minutes.'),
  long_break: z.coerce.number().int('Long break: 1–120 minutes.').min(1, 'Long break: 1–120 minutes.').max(120, 'Long break: 1–120 minutes.'),
  long_every: z.coerce.number().int('Long break every: 2–10 sessions.').min(2, 'Long break every: 2–10 sessions.').max(10, 'Long break every: 2–10 sessions.'),
})

export const displayNameSchema = z.string().trim().min(1, 'Enter a name up to 80 characters.').max(80, 'Enter a name up to 80 characters.')
export const passwordChangeSchema = z.object({ a: z.string().min(8, 'Use at least 8 characters.'), b: z.string() }).refine((v) => v.a === v.b, { path: ['b'], message: 'Passwords do not match.' })
/** The word a user must type to confirm permanent account deletion. */
export const DELETE_CONFIRM_WORD = 'DELETE'

// ---------------------------------------------------------------- reminders
export const REMINDER_KIND_VALUES = ['task', 'study', 'workout', 'habit', 'bill', 'custom'] as const
export const REMINDER_REPEAT_VALUES = ['none', 'daily', 'weekly', 'monthly'] as const
export const reminderFormSchema = z.object({
  kind: z.enum(REMINDER_KIND_VALUES),
  title: z.string().trim().min(1, 'What should we remind you about?').max(160, 'Keep it under 160 characters'),
  remind_date: z.string().refine(isValidDay, 'Pick a date'),
  remind_time: z.string().regex(/^\d{2}:\d{2}$/, 'Pick a time'),
  repeat: z.enum(REMINDER_REPEAT_VALUES),
})
export type ReminderForm = z.infer<typeof reminderFormSchema>
export const blankReminder = (today: string): ReminderForm => ({ kind: 'custom', title: '', remind_date: today, remind_time: '09:00', repeat: 'none' })
export const reminderToForm = (r: { kind: ReminderForm['kind']; title: string; remind_date: string; remind_time: string; repeat: ReminderForm['repeat'] }): ReminderForm =>
  ({ kind: r.kind, title: r.title, remind_date: r.remind_date, remind_time: r.remind_time.slice(0, 5), repeat: r.repeat })
/** Saving (new or edited) re-arms the reminder: active again and not yet fired. */
export const reminderToPayload = (v: ReminderForm) => ({ ...v, title: v.title.trim(), active: true, last_fired_on: null })
