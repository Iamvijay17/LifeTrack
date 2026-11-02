// CSV export. Cells starting with = + - @ are prefixed with ' to prevent spreadsheet formula injection.
const esc = (v) => {
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export function toCsv(rows, columns) {
  const head = columns.map((c) => esc(c.header)).join(',')
  const body = rows.map((r) => columns.map((c) => esc(c.value(r))).join(','))
  return [head, ...body].join('\r\n')
}
export function download(filename, text, type = 'text/csv;charset=utf-8') {
  const bom = type.startsWith('text/csv') ? '\ufeff' : '' // BOM helps Excel read UTF-8 CSV; it would corrupt JSON
  const url = URL.createObjectURL(new Blob([bom + text], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export const TX_COLUMNS = [
  { header: 'Date', value: (r) => r.txn_date }, { header: 'Type', value: (r) => r.type }, { header: 'Category', value: (r) => r.category }, { header: 'Payment method', value: (r) => r.payment_method },
  { header: 'Amount (INR)', value: (r) => (r.amount_paise / 100).toFixed(2) }, { header: 'Note', value: (r) => r.note },
]
export const JOB_COLUMNS = [
  { header: 'Company', value: (r) => r.company }, { header: 'Title', value: (r) => r.job_title }, { header: 'Status', value: (r) => r.status },
  { header: 'Applied', value: (r) => r.applied_date }, { header: 'Location', value: (r) => r.location }, { header: 'Package (LPA)', value: (r) => (r.salary_paise != null ? r.salary_paise / 1e7 : '') },
  { header: 'Source', value: (r) => r.source }, { header: 'Contact', value: (r) => r.contact_person }, { header: 'Follow-up', value: (r) => r.followup_date },
  { header: 'Resume', value: (r) => r.resume_version }, { header: 'URL', value: (r) => r.jd_url }, { header: 'Notes', value: (r) => r.notes },
]

/** Every exportable module table with a friendly name. */
export const EXPORTABLE = [
  ['tasks', 'Tasks'], ['habits', 'Habits'], ['habit_logs', 'Habit check-ins'], ['study_sessions', 'Study sessions'], ['focus_sessions', 'Focus sessions'],
  ['job_applications', 'Job applications'], ['interview_events', 'Interviews'], ['workouts', 'Workouts'], ['exercise_logs', 'Exercise sets'],
  ['body_measurements', 'Body measurements'], ['health_logs', 'Sleep & health'], ['transactions', 'Transactions'], ['budgets', 'Budgets'], ['savings_goals', 'Savings goals'],
  ['notes', 'Notes'], ['journal_entries', 'Journal'], ['goals', 'Goals'], ['milestones', 'Milestones'], ['reminders', 'Reminders'],
]
const cell = (v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v)
/** CSV of an entire table read straight from the database (owner id omitted). Returns '' when the table is empty. */
export async function tableToCsv(table) {
  const { db } = await import('./db')
  const rows = await db.list(table)
  if (!rows.length) return ''
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => k !== 'user_id')
  return toCsv(rows, keys.map((k) => ({ header: k, value: (r) => cell(r[k]) })))
}
