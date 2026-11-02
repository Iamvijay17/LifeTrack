import { z } from 'zod'
import { isValidDay } from '@lifetrack/utils'
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
