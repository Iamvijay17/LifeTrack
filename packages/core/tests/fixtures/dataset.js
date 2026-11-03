// A small but realistic account used by BOTH platforms' tests. Any platform that renders these tables through
// the shared logic must show exactly the same numbers (see parity.test.js and apps/mobile/tests/parity.test.ts).
export const TODAY = '2026-11-02' // Monday
export const NOW_MS = Date.parse('2026-11-02T06:30:00Z') // 12:00 in Asia/Kolkata
export const SETTINGS = {
  timezone: 'Asia/Kolkata', currency: 'INR', week_starts_on: 1, daily_study_target_minutes: 60, water_goal_ml: 2000, steps_goal: 10000,
  monthly_budget_paise: 1000000, workout_plan: { 1: 'rt1', 3: 'rt1', 0: 'rest' }, score_weights: { learning: 25, career: 25, fitness: 20, habits: 15, health: 15 },
}
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const T = (n, o) => ({ id: id(n), user_id: 'u', title: `Task ${n}`, notes: '', category: 'Personal', priority: 'medium', status: 'pending', due_date: TODAY, started_at: null, completed_at: null, recurrence: 'none', recurrence_until: null, series_id: null, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', ...o })

export const TABLES = {
  tasks: [
    T(1, { title: 'Ship report', priority: 'high' }), T(2), T(3, { status: 'done', completed_at: '2026-11-02T04:00:00Z' }), T(4, { priority: 'low' }),
    T(5, { due_date: '2026-10-30' }), T(6, { due_date: '2026-11-04' }), T(7, { status: 'cancelled' }), T(8, { due_date: null }),
  ],
  habits: [
    { id: id(20), user_id: 'u', name: 'Read', description: '', color: '#8B5CF6', frequency: 'daily', days_of_week: [], weekly_target: 3, start_date: '2026-10-20', archived_at: null, created_at: '2026-10-20T00:00:00Z', updated_at: '2026-10-20T00:00:00Z' },
    { id: id(21), user_id: 'u', name: 'Stretch', description: '', color: '#22C55E', frequency: 'custom', days_of_week: [1, 3, 5], weekly_target: 3, start_date: '2026-10-20', archived_at: null, created_at: '2026-10-20T00:00:00Z', updated_at: '2026-10-20T00:00:00Z' },
  ],
  habit_logs: ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'].map((d, i) => ({ id: id(30 + i), user_id: 'u', habit_id: id(20), log_date: d, status: 'done', note: '', created_at: `${d}T03:00:00Z`, updated_at: `${d}T03:00:00Z` }))
    .concat([{ id: id(40), user_id: 'u', habit_id: id(21), log_date: '2026-11-02', status: 'done', note: '', created_at: '2026-11-02T03:30:00Z', updated_at: '2026-11-02T03:30:00Z' }]),
  study_sessions: [
    { id: id(50), user_id: 'u', goal_id: id(90), topic_id: null, session_date: TODAY, started_at: '2026-11-02T03:00:00Z', ended_at: '2026-11-02T03:30:00Z', duration_seconds: 1800, status: 'completed', source: 'timer', problems_solved: 2, notes: '', created_at: '2026-11-02T03:30:00Z' },
    { id: id(51), user_id: 'u', goal_id: null, topic_id: null, session_date: '2026-10-28', started_at: '2026-10-28T03:00:00Z', ended_at: '2026-10-28T04:00:00Z', duration_seconds: 3600, status: 'completed', source: 'manual', problems_solved: 3, notes: '', created_at: '2026-10-28T04:00:00Z' },
    { id: id(52), user_id: 'u', goal_id: null, topic_id: null, session_date: TODAY, started_at: '2026-11-02T06:00:00Z', ended_at: null, duration_seconds: null, status: 'running', source: 'timer', problems_solved: 0, notes: '', created_at: '2026-11-02T06:00:00Z' },
  ],
  workouts: [
    { id: id(60), user_id: 'u', routine_id: null, workout_date: TODAY, name: 'Push', kind: 'strength', status: 'completed', duration_minutes: 50, cardio_minutes: null, cardio_distance_km: null, notes: '', created_at: '2026-11-02T02:00:00Z' },
    { id: id(61), user_id: 'u', routine_id: null, workout_date: '2026-10-28', name: 'Legs', kind: 'strength', status: 'completed', duration_minutes: 60, cardio_minutes: null, cardio_distance_km: null, notes: '', created_at: '2026-10-28T02:00:00Z' },
  ],
  health_logs: [
    { id: id(70), user_id: 'u', log_date: TODAY, bedtime: '23:30', wake_time: '06:30', sleep_minutes: 420, water_ml: 1000, steps: 5000, energy_level: 4, weight_kg: '71.0', notes: '' },
    { id: id(71), user_id: 'u', log_date: '2026-10-30', bedtime: null, wake_time: null, sleep_minutes: 480, water_ml: 2000, steps: 9000, energy_level: null, weight_kg: '72.0', notes: '' },
  ],
  transactions: [
    { id: id(80), user_id: 'u', type: 'income', amount_paise: 5000000, category: 'Salary', txn_date: '2026-11-01', note: '', payment_method: 'Bank transfer', created_at: '2026-11-01T05:00:00Z' },
    { id: id(81), user_id: 'u', type: 'expense', amount_paise: 25050, category: 'Food', txn_date: TODAY, note: 'Lunch', payment_method: 'UPI', created_at: '2026-11-02T05:30:00Z' },
    { id: id(82), user_id: 'u', type: 'expense', amount_paise: 99900, category: 'Bills', txn_date: '2026-10-15', note: '', payment_method: 'UPI', created_at: '2026-10-15T05:30:00Z' },
    { id: id(83), user_id: 'u', type: 'savings', amount_paise: 100000, category: 'Goal', txn_date: '2026-11-01', note: '', payment_method: 'Other', created_at: '2026-11-01T06:00:00Z' },
  ],
  job_applications: [
    { id: id(100), user_id: 'u', company: 'Acme', job_title: 'Dev', status: 'interview', applied_date: '2026-10-20', salary_paise: 185000000, source: 'LinkedIn', followup_date: null, created_at: '2026-10-20T00:00:00Z' },
    { id: id(101), user_id: 'u', company: 'Beta', job_title: 'Dev', status: 'applied', applied_date: TODAY, salary_paise: null, source: '', followup_date: null, created_at: '2026-11-02T00:00:00Z' },
  ],
  application_history: [
    { id: id(110), user_id: 'u', application_id: id(100), from_status: null, to_status: 'applied', changed_at: '2026-10-20T01:00:00Z' },
    { id: id(111), user_id: 'u', application_id: id(100), from_status: 'applied', to_status: 'interview', changed_at: '2026-10-25T01:00:00Z' },
    { id: id(112), user_id: 'u', application_id: id(101), from_status: null, to_status: 'applied', changed_at: '2026-11-02T01:00:00Z' },
  ],
  interview_events: [{ id: id(120), user_id: 'u', application_id: id(100), round_name: 'Tech', scheduled_at: '2026-11-04T05:30:00Z', mode: 'video', status: 'scheduled' }],
  goals: [
    { id: id(90), user_id: 'u', title: 'Learn React', category: 'Learning', topic_id: null, target_minutes: 300, due_date: '2026-12-01', status: 'active', notes: '', period: 'monthly', start_date: null, manual_progress: 0, completed_at: null },
    { id: id(91), user_id: 'u', title: 'Run 5k', category: 'Fitness', topic_id: null, target_minutes: 0, due_date: '2026-11-30', status: 'active', notes: '', period: 'monthly', start_date: null, manual_progress: 40, completed_at: null },
  ],
  milestones: [],
}
export const toInput = (t) => ({ tasks: t.tasks, studySessions: t.study_sessions, workouts: t.workouts, healthLogs: t.health_logs, transactions: t.transactions, applications: t.job_applications, history: t.application_history, interviews: t.interview_events, goals: t.goals, milestones: t.milestones, habits: t.habits, habitLogs: t.habit_logs })

/** The numbers every platform must show for this dataset. Update only when the product rules intentionally change. */
export const GOLDEN = {
  dashboard: {
    openToday: 3, doneTodayTasks: 1, topTaskIds: [id(1), id(2), id(4)], studyMin: 30, timerRunning: true, spentToday: 25050, weekApps: 1,
    habitsDue: 2, habitsDone: 2, gym: 'Done', month: { income: 5000000, expense: 25050, savings: 100000, remaining: 974950 },
    goalPercents: [40, 10], weekScoresLength: 7, futureDaysWithoutScore: 6,
  },
  analyticsMonth: { studyMinutes: 90, studySessionCount: 2, problems: 5, expense: 124950 /* 25,050 + 99,900 */, sleepAvg: 450, jobsApplied: 2, jobsInterviews: 1, workouts: 2 },
}
