import { z } from 'zod'

// Zod mirrors of the Postgres schema in supabase/migrations (the source of truth). tests/db-drift.test.ts fails if they diverge.
// Conventions: dates are 'yyyy-MM-dd' strings, timestamps are ISO strings, money is integer paise.

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected yyyy-MM-dd')
const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Expected HH:mm')
const ts = z.string().min(1)
const uuid = z.string().uuid()
const str = (min: number, max: number) => z.string().min(min).max(max)
const int = () => z.number().int()
const paise = () => z.number().int().nonnegative()
const json = <T extends z.ZodTypeAny>(t: T) => t
const text = () => z.string()

export const TASK_CATEGORIES = ['Learning', 'Job Search', 'Gym', 'Health', 'Personal', 'Finance'] as const
export const JOB_STATUSES = ['interested', 'preparing', 'applied', 'assessment', 'interview', 'selected', 'offer', 'rejected', 'withdrawn'] as const
export const PAYMENT_METHODS = ['Cash', 'UPI', 'Credit card', 'Debit card', 'Bank transfer', 'Other'] as const
export const REMINDER_KINDS = ['task', 'study', 'workout', 'habit', 'bill', 'custom'] as const

/** Writable columns per table. Optional = has a DB default or is nullable. */
const insertShapes = {
  profiles: { display_name: str(0, 80).optional() },
  user_settings: {
    timezone: text().optional(), currency: text().optional(), theme: z.enum(['dark', 'light', 'system']).optional(),
    daily_study_target_minutes: int().min(0).max(1440).optional(), monthly_budget_paise: paise().optional(),
    water_goal_ml: int().min(0).max(20000).optional(), steps_goal: int().min(0).max(200000).optional(),
    week_starts_on: z.union([z.literal(0), z.literal(1)]).optional(),
    habit_prefs: json(z.record(z.any())).optional(), workout_plan: json(z.record(z.any())).optional(), defaults_seeded: z.boolean().optional(),
    score_weights: json(z.record(z.number())).optional(), dashboard_widgets: json(z.record(z.any())).optional(),
    notification_prefs: json(z.record(z.boolean())).optional(), focus_prefs: json(z.record(z.number())).optional(),
  },
  learning_topics: { group_name: str(1, 60), name: str(1, 80), notes: text().optional(), revision_dates: z.array(day).optional(), archived: z.boolean().optional() },
  goals: {
    title: str(1, 120), category: text().optional(), topic_id: uuid.nullable().optional(), target_minutes: int().nonnegative().optional(),
    due_date: day.nullable().optional(), status: z.enum(['active', 'completed', 'archived']).optional(), notes: text().optional(),
    period: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(), start_date: day.nullable().optional(),
    manual_progress: int().min(0).max(100).optional(), completed_at: ts.nullable().optional(),
  },
  tasks: {
    title: str(1, 200), notes: text().optional(), category: z.enum(TASK_CATEGORIES).optional(), priority: z.enum(['low', 'medium', 'high']).optional(),
    status: z.enum(['pending', 'in_progress', 'done', 'skipped', 'cancelled']).optional(), due_date: day.nullable().optional(),
    started_at: ts.nullable().optional(), completed_at: ts.nullable().optional(),
    recurrence: z.enum(['none', 'daily', 'weekdays', 'weekly', 'monthly']).optional(), recurrence_until: day.nullable().optional(), series_id: uuid.nullable().optional(),
  },
  habits: {
    name: str(1, 80), description: text().optional(), color: text().optional(), frequency: z.enum(['daily', 'weekly', 'custom']).optional(),
    days_of_week: z.array(int().min(0).max(6)).optional(), weekly_target: int().min(1).max(7).optional(), start_date: day.optional(), archived_at: ts.nullable().optional(),
  },
  habit_logs: { habit_id: uuid, log_date: day, status: z.enum(['done', 'skipped', 'rest']).optional(), note: text().optional() },
  study_sessions: {
    goal_id: uuid.nullable().optional(), topic_id: uuid.nullable().optional(), session_date: day, started_at: ts.optional(), ended_at: ts.nullable().optional(),
    duration_seconds: int().nonnegative().nullable().optional(), status: z.enum(['running', 'completed', 'discarded']).optional(),
    source: z.enum(['timer', 'manual']).optional(), problems_solved: int().nonnegative().optional(), notes: text().optional(),
  },
  job_applications: {
    company: str(1, 120), job_title: str(1, 120), jd_url: text().optional(), location: text().optional(), salary_paise: paise().nullable().optional(),
    applied_date: day.nullable().optional(), source: text().optional(), status: z.enum(JOB_STATUSES).optional(), contact_person: text().optional(),
    followup_date: day.nullable().optional(), resume_version: text().optional(),
    prep_checklist: z.array(z.object({ id: z.string(), text: z.string(), done: z.boolean() })).optional(), notes: text().optional(),
  },
  application_history: { application_id: uuid, from_status: text().nullable().optional(), to_status: text(), note: text().optional(), changed_at: ts.optional() },
  interview_events: {
    application_id: uuid, round_name: text().optional(), scheduled_at: ts, mode: z.enum(['video', 'phone', 'onsite', 'other']).optional(),
    link: text().optional(), status: z.enum(['scheduled', 'completed', 'cancelled']).optional(), notes: text().optional(),
  },
  exercises: { name: str(1, 80), muscle_group: text().optional(), equipment: text().optional() },
  routines: {
    name: str(1, 80), exercises: z.array(z.object({ name: z.string(), sets: z.number().optional(), reps: z.number().optional(), weight_kg: z.number().optional() }).passthrough()).optional(),
    notes: text().optional(), archived_at: ts.nullable().optional(),
  },
  workouts: {
    routine_id: uuid.nullable().optional(), workout_date: day, name: text().optional(), kind: z.enum(['strength', 'cardio', 'mixed', 'other']).optional(),
    status: z.enum(['completed', 'skipped', 'rest']).optional(), duration_minutes: int().min(0).max(1440).nullable().optional(),
    cardio_minutes: int().min(0).max(1440).nullable().optional(), cardio_distance_km: z.number().nonnegative().nullable().optional(), notes: text().optional(),
  },
  exercise_logs: {
    workout_id: uuid, exercise_id: uuid.nullable().optional(), exercise_name: text(), order_index: int().optional(),
    set_number: int().min(1).optional(), reps: int().nonnegative().optional(), weight_kg: z.number().nonnegative().optional(),
  },
  body_measurements: {
    measured_on: day, chest_cm: z.number().nullable().optional(), waist_cm: z.number().nullable().optional(), hips_cm: z.number().nullable().optional(),
    arm_cm: z.number().nullable().optional(), thigh_cm: z.number().nullable().optional(), body_fat_pct: z.number().nullable().optional(), notes: text().optional(),
  },
  health_logs: {
    log_date: day, bedtime: time.nullable().optional(), wake_time: time.nullable().optional(), sleep_minutes: int().min(0).max(1440).nullable().optional(),
    water_ml: int().min(0).max(20000).optional(), steps: int().min(0).max(200000).optional(), energy_level: int().min(1).max(5).nullable().optional(),
    weight_kg: z.number().min(20).max(500).nullable().optional(), notes: text().optional(),
  },
  transactions: {
    type: z.enum(['income', 'expense', 'savings']), amount_paise: z.number().int().positive(), category: text().optional(), txn_date: day,
    note: text().optional(), payment_method: z.enum(PAYMENT_METHODS).optional(),
  },
  budgets: { month: day.refine((d) => d.endsWith('-01'), 'Must be the first day of a month'), category: text().optional(), amount_paise: paise() },
  journal_entries: { entry_date: day, mood: int().min(1).max(5).nullable().optional(), content: text().optional(), wins: text().optional() },
  milestones: { goal_id: uuid, title: str(1, 160), due_date: day.nullable().optional(), done: z.boolean().optional(), completed_at: ts.nullable().optional(), position: int().optional() },
  focus_sessions: {
    session_date: day, kind: z.enum(['focus', 'short_break', 'long_break']).optional(), planned_minutes: int().min(1).max(240), actual_seconds: int().nonnegative().optional(),
    completed: z.boolean().optional(), task_id: uuid.nullable().optional(), topic_id: uuid.nullable().optional(), label: str(0, 120).optional(), started_at: ts.optional(),
  },
  notes: {
    title: str(0, 160).optional(), body: text().optional(), category: str(1, 40).optional(), tags: z.array(z.string()).optional(), pinned: z.boolean().optional(),
    goal_id: uuid.nullable().optional(), task_id: uuid.nullable().optional(),
  },
  savings_goals: { name: str(1, 80), target_paise: z.number().int().positive(), saved_paise: paise().optional(), target_date: day.nullable().optional() },
  reminders: {
    kind: z.enum(REMINDER_KINDS).optional(), title: str(1, 160), remind_date: day, remind_time: time.optional(),
    repeat: z.enum(['none', 'daily', 'weekly', 'monthly']).optional(), active: z.boolean().optional(), last_fired_on: day.nullable().optional(),
  },
  device_push_tokens: { token: z.string().regex(/^(Expo|Exponent)PushToken\[[^\]]+\]$/), platform: z.enum(['ios', 'android']), device_name: str(0, 80).optional(), last_seen_at: ts.optional() },
  notifications: {
    kind: z.enum([...REMINDER_KINDS, 'system']).optional(), title: str(1, 200), body: text().optional(), link: text().optional(),
    dedupe_key: text().nullable().optional(), read_at: ts.nullable().optional(),
  },
} satisfies Record<string, z.ZodRawShape>

export type TableName = keyof typeof insertShapes
export const TABLE_NAMES = Object.keys(insertShapes) as TableName[]

/** Server-managed columns per table (everything else in a Row is a writable column). */
const SYSTEM: Record<string, z.ZodRawShape> = {
  profiles: { id: uuid, created_at: ts, updated_at: ts },
  application_history: { id: uuid, user_id: uuid },
  exercise_logs: { id: uuid, user_id: uuid, created_at: ts },
}
const DEFAULT_SYSTEM: z.ZodRawShape = { id: uuid, user_id: uuid, created_at: ts, updated_at: ts }

type Shapes = typeof insertShapes
type Insert<T extends TableName> = z.ZodObject<Shapes[T]>
type S = z.ZodString
type SysShape<T extends TableName> = T extends 'profiles' ? { id: S; created_at: S; updated_at: S }
  : T extends 'application_history' ? { id: S; user_id: S }
  : T extends 'exercise_logs' ? { id: S; user_id: S; created_at: S }
  : { id: S; user_id: S; created_at: S; updated_at: S }
type Row<T extends TableName> = z.ZodObject<ReturnType<Insert<T>['required']>['shape'] & SysShape<T>>

/** What a client may send when creating/updating a row (user_id and timestamps are set by the server). */
export const insertSchemas = Object.fromEntries(TABLE_NAMES.map((t) => [t, z.object(insertShapes[t]).strict()])) as { [T in TableName]: Insert<T> }

/** A row as returned by Supabase. */
export const rowSchemas = Object.fromEntries(
  TABLE_NAMES.map((t) => [t, z.object(insertShapes[t]).required().extend(SYSTEM[t] ?? DEFAULT_SYSTEM)]),
) as unknown as { [T in TableName]: Row<T> }

/** Partial update payload (every writable column optional). */
export const updateSchemas = Object.fromEntries(TABLE_NAMES.map((t) => [t, z.object(insertShapes[t]).partial().strict()])) as unknown as { [T in TableName]: ReturnType<Insert<T>['partial']> }
