import type { Q } from './helpers'

/**
 * How to create ONE valid row of every user-owned table. The RLS suite is generated from this map and from the live catalog:
 * a table that exists in the database but is missing here FAILS the governance test, so new tables cannot ship without isolation tests.
 *
 *   parents  : FK column → parent table. The harness creates the parent (owned by the acting user) unless an override is given.
 *   insert   : inserts the row with an EXPLICIT user_id = `owner` (so tests can try to spoof another owner) and returns its id.
 *   kind     : 'normal' (default) | 'singleton' (one row per user, created at sign-up) | 'rpc' (written only through functions)
 */
export interface Fixture {
  kind?: 'normal' | 'singleton' | 'rpc'
  parents?: Record<string, string>
  insert?: (run: Q, owner: string, refs: Record<string, string>) => Promise<string>
}
const one = async (run: Q, sql: string, params: unknown[]) => (await run(sql + ' returning id', params)).rows[0].id as string

export const FIXTURES: Record<string, Fixture> = {
  profiles: { kind: 'singleton' },
  user_settings: { kind: 'singleton' },
  device_push_tokens: { kind: 'rpc' },
  // 0012: no client policies at all; reached only through functions (see pglite/security.test.ts for their isolation tests).
  user_security: { kind: 'rpc' },
  app_unlocks: { kind: 'rpc' },
  passkeys: { kind: 'rpc' },
  webauthn_challenges: { kind: 'rpc' },
  password_attempts: { kind: 'rpc' },
  learning_topics: { insert: (r, o) => one(r, `insert into learning_topics(user_id, group_name, name) values ($1,'Frontend','React')`, [o]) },
  goals: { insert: (r, o, f) => one(r, `insert into goals(user_id, title, topic_id) values ($1,'Ship v1',$2)`, [o, f.topic_id ?? null]) },
  tasks: { insert: (r, o) => one(r, `insert into tasks(user_id, title) values ($1,'Write report')`, [o]) },
  habits: { insert: (r, o) => one(r, `insert into habits(user_id, name) values ($1,'Read')`, [o]) },
  habit_logs: { parents: { habit_id: 'habits' }, insert: (r, o, f) => one(r, `insert into habit_logs(user_id, habit_id, log_date) values ($1,$2,'2026-11-02')`, [o, f.habit_id]) },
  study_sessions: { insert: (r, o, f) => one(r, `insert into study_sessions(user_id, session_date, status, duration_seconds, goal_id, topic_id) values ($1,'2026-11-02','completed',60,$2,$3)`, [o, f.goal_id ?? null, f.topic_id ?? null]) },
  job_applications: { insert: (r, o) => one(r, `insert into job_applications(user_id, company, job_title) values ($1,'Acme','Dev')`, [o]) },
  application_history: { parents: { application_id: 'job_applications' }, insert: (r, o, f) => one(r, `insert into application_history(user_id, application_id, to_status) values ($1,$2,'applied')`, [o, f.application_id]) },
  interview_events: { parents: { application_id: 'job_applications' }, insert: (r, o, f) => one(r, `insert into interview_events(user_id, application_id, scheduled_at) values ($1,$2,'2026-11-05T10:00:00Z')`, [o, f.application_id]) },
  exercises: { insert: (r, o) => one(r, `insert into exercises(user_id, name) values ($1,'Bench')`, [o]) },
  routines: { insert: (r, o) => one(r, `insert into routines(user_id, name) values ($1,'Push')`, [o]) },
  workouts: { insert: (r, o, f) => one(r, `insert into workouts(user_id, workout_date, routine_id) values ($1,'2026-11-02',$2)`, [o, f.routine_id ?? null]) },
  exercise_logs: { parents: { workout_id: 'workouts' }, insert: (r, o, f) => one(r, `insert into exercise_logs(user_id, workout_id, exercise_name, exercise_id) values ($1,$2,'Bench',$3)`, [o, f.workout_id, f.exercise_id ?? null]) },
  body_measurements: { insert: (r, o) => one(r, `insert into body_measurements(user_id, measured_on, waist_cm) values ($1,'2026-11-02',82)`, [o]) },
  health_logs: { insert: (r, o) => one(r, `insert into health_logs(user_id, log_date) values ($1,'2026-11-02')`, [o]) },
  foods: { insert: (r, o) => one(r, `insert into foods(user_id, name, kcal) values ($1,'Idli',58)`, [o]) },
  food_logs: { insert: (r, o, f) => one(r, `insert into food_logs(user_id, log_date, meal_type, name, food_id) values ($1,'2026-11-02','breakfast','Idli',$2)`, [o, f.food_id ?? null]) },
  water_logs: { insert: (r, o) => one(r, `insert into water_logs(user_id, log_date, amount_ml) values ($1,'2026-11-02',250)`, [o]) },
  nutrition_settings: { insert: (r, o) => one(r, `insert into nutrition_settings(user_id, calorie_goal) values ($1,2000)`, [o]) },
  recurring_rules: { insert: (r, o) => one(r, `insert into recurring_rules(user_id, type, amount_paise, anchor_day, next_date) values ($1,'expense',100,2,'2026-11-02')`, [o]) },
  transactions: { insert: (r, o, f) => one(r, `insert into transactions(user_id, type, amount_paise, txn_date, recurring_rule_id, recurring_date) values ($1,'expense',100,'2026-11-02',$2,$3)`, [o, f.recurring_rule_id ?? null, f.recurring_rule_id ? '2026-11-02' : null]) },
  budgets: { insert: (r, o) => one(r, `insert into budgets(user_id, month, amount_paise) values ($1,'2026-11-01',100)`, [o]) },
  journal_entries: { insert: (r, o) => one(r, `insert into journal_entries(user_id, entry_date, content) values ($1,'2026-11-02','x')`, [o]) },
  milestones: { parents: { goal_id: 'goals' }, insert: (r, o, f) => one(r, `insert into milestones(user_id, goal_id, title) values ($1,$2,'Design')`, [o, f.goal_id]) },
  focus_sessions: { insert: (r, o, f) => one(r, `insert into focus_sessions(user_id, session_date, planned_minutes, task_id, topic_id) values ($1,'2026-11-02',25,$2,$3)`, [o, f.task_id ?? null, f.topic_id ?? null]) },
  notes: { insert: (r, o, f) => one(r, `insert into notes(user_id, title, goal_id, task_id) values ($1,'Retro',$2,$3)`, [o, f.goal_id ?? null, f.task_id ?? null]) },
  savings_goals: { insert: (r, o, f) => one(r, `insert into savings_goals(user_id, name, target_paise) values ($1,'Fund',1000)`, [o]) },
  reminders: { insert: (r, o) => one(r, `insert into reminders(user_id, title, remind_date) values ($1,'Pay rent','2026-11-02')`, [o]) },
  notifications: { insert: (r, o) => one(r, `insert into notifications(user_id, title) values ($1,'Hello')`, [o]) },
  calendar_events: { insert: (r, o, f) => one(r, `insert into calendar_events(user_id, title, starts_at, ends_at, goal_id, topic_id, application_id, routine_id) values ($1,'Standup','2026-11-05T04:00:00Z','2026-11-05T04:30:00Z',$2,$3,$4,$5)`, [o, f.goal_id ?? null, f.topic_id ?? null, f.application_id ?? null, f.routine_id ?? null]) },
  calendar_event_exceptions: { parents: { event_id: 'calendar_events' }, insert: (r, o, f) => one(r, `insert into calendar_event_exceptions(user_id, event_id, occurrence_date, status) values ($1,$2,'2026-11-05','cancelled')`, [o, f.event_id]) },
}

/** Foreign keys from a user-owned child table to another user-owned parent, as inserted by the fixtures. Optional links are listed
 *  with a column override so the FK test can attach a child to a parent the child's owner does not own. */
export const OPTIONAL_LINKS: { child: string; column: string; parent: string }[] = [
  { child: 'goals', column: 'topic_id', parent: 'learning_topics' },
  { child: 'study_sessions', column: 'goal_id', parent: 'goals' },
  { child: 'study_sessions', column: 'topic_id', parent: 'learning_topics' },
  { child: 'workouts', column: 'routine_id', parent: 'routines' },
  { child: 'exercise_logs', column: 'exercise_id', parent: 'exercises' },
  { child: 'focus_sessions', column: 'task_id', parent: 'tasks' },
  { child: 'focus_sessions', column: 'topic_id', parent: 'learning_topics' },
  { child: 'notes', column: 'goal_id', parent: 'goals' },
  { child: 'notes', column: 'task_id', parent: 'tasks' },
  { child: 'food_logs', column: 'food_id', parent: 'foods' },
  { child: 'transactions', column: 'recurring_rule_id', parent: 'recurring_rules' },
  { child: 'calendar_events', column: 'goal_id', parent: 'goals' },
  { child: 'calendar_events', column: 'topic_id', parent: 'learning_topics' },
  { child: 'calendar_events', column: 'application_id', parent: 'job_applications' },
  { child: 'calendar_events', column: 'routine_id', parent: 'routines' },
]
