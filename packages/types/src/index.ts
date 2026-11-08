import type { z } from 'zod'
import type { insertSchemas, rowSchemas, updateSchemas, TableName } from '@lifetrack/schemas'

export type { TableName }
/** A row as returned by Supabase for table T. */
export type Row<T extends TableName> = z.infer<(typeof rowSchemas)[T]>
/** Payload accepted when creating a row in table T. */
export type Insert<T extends TableName> = z.infer<(typeof insertSchemas)[T]>
/** Partial payload accepted when updating a row in table T. */
export type Update<T extends TableName> = z.infer<(typeof updateSchemas)[T]>

export type Task = Row<'tasks'>
export type Habit = Row<'habits'>
export type HabitLog = Row<'habit_logs'>
export type Goal = Row<'goals'>
export type Milestone = Row<'milestones'>
export type LearningTopic = Row<'learning_topics'>
export type StudySession = Row<'study_sessions'>
export type JobApplication = Row<'job_applications'>
export type InterviewEvent = Row<'interview_events'>
export type Exercise = Row<'exercises'>
export type Routine = Row<'routines'>
export type Workout = Row<'workouts'>
export type ExerciseLog = Row<'exercise_logs'>
export type BodyMeasurement = Row<'body_measurements'>
export type HealthLog = Row<'health_logs'>
export type Transaction = Row<'transactions'>
export type RecurringRule = Row<'recurring_rules'>
export type Budget = Row<'budgets'>
export type SavingsGoal = Row<'savings_goals'>
export type JournalEntry = Row<'journal_entries'>
export type FocusSession = Row<'focus_sessions'>
export type Note = Row<'notes'>
export type Reminder = Row<'reminders'>
export type AppNotification = Row<'notifications'>
export type UserSettings = Row<'user_settings'>
