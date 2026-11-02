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
