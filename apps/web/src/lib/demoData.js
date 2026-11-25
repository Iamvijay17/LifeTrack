// Sample data for demo mode. Everything is generated from the date, never copied from a real account, and the generator is deterministic (the same
// day always gives the same demo) so screenshots and tests are stable. It only describes rows; services/demo.js decides where they go (an
// in-memory database that nothing else can read, and that disappears on reload).
import { addDays } from '@/lib/dates'

/** A small seeded random generator: same seed, same sequence. */
export function rng(seed = 7) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

const at = (day, hhmm, offsetMin = 330) => {
  // `day` and `hhmm` are local to the demo person (IST); stored as an ISO instant.
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.parse(`${day}T00:00:00Z`) + (h * 60 + m - offsetMin) * 60000).toISOString()
}
const monthStart = (day) => `${day.slice(0, 7)}-01`
const pick = (r, list) => list[Math.floor(r() * list.length)]

/**
 * The demo, as stages to insert in order. A stage's `rows` may be a function of what earlier stages produced (`made[table]` = the stored rows),
 * so ids are never guessed.
 * @returns {{ table: string, rows: object[] | ((made: Record<string, any[]>) => object[]) }[]}
 */
export function demoStages(today) {
  const r = rng(Number(today.replaceAll('-', '')))
  const d = (n) => addDays(today, n)
  const stages = []
  const add = (table, rows) => stages.push({ table, rows })

  add('learning_topics', [
    { group_name: 'Engineering', name: 'System design', notes: 'Caching, queues, sharding.' },
    { group_name: 'Engineering', name: 'TypeScript', notes: '' },
    { group_name: 'Career', name: 'Interview practice', notes: '' },
    { group_name: 'Languages', name: 'Spanish', notes: '15 minutes a day.' },
  ])
  add('goals', (m) => [
    {
      title: 'Finish the system design course',
      category: 'Learning',
      topic_id: m.learning_topics[0].id,
      target_minutes: 1200,
      period: 'monthly',
      due_date: d(21),
      start_date: d(-9),
      manual_progress: 55,
    },
    { title: 'Run a 10K', category: 'Fitness', period: 'yearly', due_date: d(90), manual_progress: 30, notes: 'Build up 1 km a week.' },
    { title: 'Save an emergency fund', category: 'Finance', period: 'yearly', due_date: d(180), manual_progress: 40 },
  ])
  add('tasks', [
    { title: 'Review pull request for the billing service', category: 'Job Search', priority: 'high', due_date: today },
    { title: 'Book dentist appointment', category: 'Health', priority: 'medium', due_date: today },
    {
      title: 'Read chapter 4: Replication',
      category: 'Learning',
      priority: 'medium',
      due_date: today,
      start_time: '19:00',
      end_time: '20:00',
    },
    { title: 'Leg day', category: 'Gym', priority: 'medium', due_date: d(1), start_time: '07:00', end_time: '08:00' },
    { title: 'Pay electricity bill', category: 'Finance', priority: 'urgent', due_date: d(2) },
    { title: 'Plan next week', category: 'Routine', priority: 'low', due_date: d(3) },
    {
      title: 'Send thank-you note after interview',
      category: 'Job Search',
      priority: 'high',
      due_date: d(-1),
      status: 'done',
      completed_at: at(d(-1), '17:30'),
    },
    {
      title: 'Meal prep for the week',
      category: 'Health',
      priority: 'medium',
      due_date: d(-2),
      status: 'done',
      completed_at: at(d(-2), '12:00'),
    },
    { title: 'Renew gym membership', category: 'Gym', priority: 'low', due_date: d(-4) },
  ])
  add('habits', [
    { name: 'Morning walk', color: '#10B981', frequency: 'daily', start_date: d(-60) },
    { name: 'Read 20 pages', color: '#8B5CF6', frequency: 'daily', start_date: d(-60) },
    { name: 'No sugar', color: '#F59E0B', frequency: 'daily', start_date: d(-60) },
    { name: 'Gym', color: '#EF4444', frequency: 'weekly', weekly_target: 4, start_date: d(-60) },
  ])
  add('habit_logs', (m) => {
    const rows = []
    const rate = [0.85, 0.7, 0.6, 0.5]
    m.habits.forEach((h, i) => {
      for (let n = 1; n <= 45; n++) if (r() < rate[i]) rows.push({ habit_id: h.id, log_date: d(-n), status: 'done' })
      if (r() < 0.9) rows.push({ habit_id: h.id, log_date: today, status: 'done' })
    })
    return rows
  })
  add('study_sessions', (m) => {
    const rows = []
    for (let n = 0; n < 28; n++) {
      if (r() < 0.25) continue
      const minutes = 30 + Math.floor(r() * 7) * 15
      const day = d(-n)
      rows.push({
        topic_id: m.learning_topics[Math.floor(r() * 3)].id,
        session_date: day,
        started_at: at(day, '20:00'),
        ended_at: at(day, '20:00', 330 - minutes),
        duration_seconds: minutes * 60,
        status: 'completed',
        source: 'manual',
        problems_solved: Math.floor(r() * 4),
      })
    }
    return rows
  })
  add('job_applications', [
    {
      company: 'Northwind Labs',
      job_title: 'Senior Backend Engineer',
      status: 'interview',
      applied_date: d(-12),
      source: 'Referral',
      location: 'Remote',
      followup_date: d(2),
      salary_paise: 4500000 * 100,
    },
    {
      company: 'Contoso Cloud',
      job_title: 'Platform Engineer',
      status: 'applied',
      applied_date: d(-6),
      source: 'Careers page',
      location: 'Bengaluru',
      followup_date: d(4),
    },
    { company: 'Fabrikam', job_title: 'Staff Engineer', status: 'preparing', source: 'LinkedIn', location: 'Hyderabad' },
    { company: 'Tailspin', job_title: 'Backend Engineer', status: 'rejected', applied_date: d(-25), source: 'LinkedIn' },
  ])
  add('interview_events', (m) => [
    {
      application_id: m.job_applications[0].id,
      round_name: 'System design round',
      mode: 'video',
      scheduled_at: at(d(2), '15:00'),
      status: 'scheduled',
    },
  ])
  add('workouts', () => {
    const rows = []
    for (let n = 1; n <= 28; n++) {
      if (n % 7 === 0 || r() < 0.4) continue
      rows.push({
        workout_date: d(-n),
        name: pick(r, ['Push day', 'Pull day', 'Leg day', 'Full body']),
        kind: 'strength',
        status: 'completed',
        duration_minutes: 45 + Math.floor(r() * 4) * 5,
      })
    }
    return rows
  })
  add('exercise_logs', (m) =>
    m.workouts.slice(0, 8).flatMap((w) =>
      [0, 1, 2].map((i) => ({
        workout_id: w.id,
        exercise_name: ['Squat', 'Bench press', 'Row'][i],
        order_index: i,
        set_number: 1,
        reps: 8 + Math.floor(r() * 4),
        weight_kg: [60, 50, 45][i] + Math.floor(r() * 3) * 2.5,
      })),
    ),
  )
  add('body_measurements', [
    { measured_on: d(-28), waist_cm: 84, chest_cm: 98, arm_cm: 35 },
    { measured_on: d(-14), waist_cm: 83, chest_cm: 98.5, arm_cm: 35.5 },
    { measured_on: d(0), waist_cm: 82, chest_cm: 99, arm_cm: 36 },
  ])
  add('health_logs', () => {
    const rows = []
    for (let n = 0; n < 30; n++) {
      const sleep = 380 + Math.floor(r() * 9) * 15
      rows.push({
        log_date: d(-n),
        sleep_minutes: sleep,
        water_ml: 1800 + Math.floor(r() * 6) * 200,
        steps: 4500 + Math.floor(r() * 12) * 700,
        energy_level: 2 + Math.floor(r() * 4),
        weight_kg: Math.round((74.5 - n * 0.04 + r() * 0.4) * 10) / 10,
      })
    }
    return rows
  })
  add('budgets', [
    { month: monthStart(today), category: 'Food', amount_paise: 800000 },
    { month: monthStart(today), category: 'Transport', amount_paise: 300000 },
    { month: monthStart(today), category: 'Entertainment', amount_paise: 250000 },
  ])
  add('transactions', () => {
    const rows = [
      {
        type: 'income',
        amount_paise: 9500000,
        category: 'Salary',
        txn_date: monthStart(today),
        note: 'Monthly salary',
        payment_method: 'Bank transfer',
      },
    ]
    const spend = [
      ['Food', 'Groceries', 90000, 'UPI'],
      ['Food', 'Lunch out', 35000, 'UPI'],
      ['Transport', 'Metro card', 50000, 'UPI'],
      ['Entertainment', 'Streaming', 19900, 'Credit card'],
      ['Health', 'Pharmacy', 42000, 'Cash'],
      ['Shopping', 'Books', 120000, 'Debit card'],
    ]
    for (let n = 0; n < 40; n++) {
      const [category, note, amt, payment_method] = pick(r, spend)
      rows.push({ type: 'expense', amount_paise: Math.round(amt * (0.7 + r() * 0.6)), category, note, payment_method, txn_date: d(-n) })
    }
    return rows
  })
  add('savings_goals', [
    { name: 'Emergency fund', target_paise: 30000000, saved_paise: 12000000, target_date: d(180) },
    { name: 'New laptop', target_paise: 9000000, saved_paise: 3500000, target_date: d(120) },
  ])
  add('journal_entries', [
    { entry_date: d(-1), mood: 4, content: 'Good focus block on system design. Skipped the walk.', wins: 'Finished two chapters.' },
    { entry_date: d(-3), mood: 3, content: 'Busy day. Interview prep took longer than planned.', wins: '' },
  ])
  add('notes', [
    {
      title: 'System design checklist',
      body: '- Requirements first\n- Estimate load\n- Pick the data model\n- Name the trade-offs',
      category: 'Learning',
      pinned: true,
      tags: ['interview'],
    },
    { title: 'Packing list', body: 'Passport, charger, notebook.', category: 'General', tags: [] },
  ])
  add('calendar_events', [
    {
      title: 'System design round: Northwind Labs',
      category: 'jobs',
      priority: 'high',
      starts_at: at(d(2), '15:00'),
      ends_at: at(d(2), '16:00'),
      alert_minutes: [30],
    },
    { title: 'Team lunch', category: 'personal', starts_at: at(d(1), '13:00'), ends_at: at(d(1), '14:00'), location: 'Cafe Azul' },
    { title: 'Weekly review', category: 'routine', priority: 'low', starts_at: at(d(4), '18:00'), ends_at: at(d(4), '18:30') },
  ])
  return stages
}

/** Row counts per table, for the "what's in the demo" summary. */
export function demoSummary(stages) {
  return stages.filter((s) => Array.isArray(s.rows)).map((s) => [s.table, s.rows.length])
}
