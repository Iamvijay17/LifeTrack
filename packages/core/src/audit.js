// Audit history: how an event is described and compared. Pure functions over the rows of `audit_events` (see migration 0027). No I/O.

/** Every audited table: its name in the history, the module it belongs to and the page that shows it. */
export const AUDIT_ENTITIES = {
  tasks: { label: 'Task', module: 'Tasks & Goals', route: '/planner' },
  goals: { label: 'Goal', module: 'Tasks & Goals', route: '/goals' },
  milestones: { label: 'Milestone', module: 'Tasks & Goals', route: '/goals' },
  habits: { label: 'Habit', module: 'Habits & Routine', route: '/habits' },
  habit_logs: { label: 'Habit check-in', module: 'Habits & Routine', route: '/habits' },
  routines: { label: 'Routine', module: 'Habits & Routine', route: '/fitness' },
  challenges: { label: 'Challenge', module: 'Habits & Routine', route: '/challenges' },
  reminders: { label: 'Reminder', module: 'Habits & Routine', route: '/notifications' },
  learning_topics: { label: 'Topic', module: 'Career & Learning', route: '/learning' },
  study_sessions: { label: 'Study session', module: 'Career & Learning', route: '/learning' },
  job_applications: { label: 'Job application', module: 'Job Switch', route: '/jobs' },
  interview_events: { label: 'Interview', module: 'Job Switch', route: '/jobs' },
  workouts: { label: 'Workout', module: 'Gym & Fitness', route: '/fitness' },
  exercises: { label: 'Exercise', module: 'Gym & Fitness', route: '/fitness' },
  exercise_logs: { label: 'Exercise log', module: 'Gym & Fitness', route: '/fitness' },
  body_measurements: { label: 'Body measurement', module: 'Sleep & Health', route: '/fitness' },
  health_logs: { label: 'Health log', module: 'Sleep & Health', route: '/health' },
  foods: { label: 'Food', module: 'Food & Nutrition', route: '/nutrition' },
  food_logs: { label: 'Food entry', module: 'Food & Nutrition', route: '/nutrition' },
  transactions: { label: 'Transaction', module: 'Finance & Expenses', route: '/finance' },
  budgets: { label: 'Budget', module: 'Finance & Expenses', route: '/finance' },
  savings_goals: { label: 'Savings goal', module: 'Finance & Expenses', route: '/finance' },
  recurring_rules: { label: 'Recurring payment', module: 'Finance & Expenses', route: '/finance' },
  calendar_events: { label: 'Calendar event', module: 'Calendar & Timeline', route: '/calendar' },
  notes: { label: 'Note', module: 'Notes & Journal', route: '/notes' },
  journal_entries: { label: 'Journal entry', module: 'Notes & Journal', route: '/notes' },
  automation_workflows: { label: 'Automation', module: 'Automation', route: '/automation' },
  user_settings: { label: 'Settings', module: 'Account & Security', route: '/settings' },
  api_key: { label: 'API key', module: 'Account & Security', route: '/developers' },
  webhook: { label: 'Webhook', module: 'Account & Security', route: '/developers' },
  auth: { label: 'Sign-in', module: 'Account & Security', route: '/security' },
  security: { label: 'Security', module: 'Account & Security', route: '/security' },
  account: { label: 'Account', module: 'Account & Security', route: '/settings' },
  audit: { label: 'Audit history', module: 'Account & Security', route: '/audit' },
  backup: { label: 'Backup', module: 'Account & Security', route: '/export' },
  data: { label: 'Data', module: 'Account & Security', route: '/export' },
}
export const AUDIT_MODULES = [...new Set(Object.values(AUDIT_ENTITIES).map((e) => e.module))]
export const entityMeta = (entity) => AUDIT_ENTITIES[entity] ?? { label: entity.replace(/_/g, ' '), module: 'Other', route: null }
/** Table names that belong to a module (for the module filter). */
export const entitiesOfModule = (module) => Object.entries(AUDIT_ENTITIES).filter(([, v]) => v.module === module).map(([k]) => k)

export const AUDIT_ACTIONS = {
  create: { label: 'Created', tone: 'success' },
  update: { label: 'Updated', tone: 'info' },
  delete: { label: 'Deleted', tone: 'danger' },
  restore: { label: 'Restored', tone: 'primary' },
  import: { label: 'Imported', tone: 'info' },
  export: { label: 'Exported', tone: 'info' },
  login: { label: 'Signed in', tone: 'neutral' },
  logout: { label: 'Signed out', tone: 'neutral' },
  permission: { label: 'Permission', tone: 'warning' },
  config: { label: 'Configuration', tone: 'neutral' },
  security: { label: 'Security', tone: 'warning' },
}
export const SOURCES = { web: 'Web app', mobile: 'Mobile app', api: 'API', job: 'Background job', database: 'Database' }

const FIELD_LABELS = {
  due_date: 'Due date', txn_date: 'Date', amount_paise: 'Amount', workout_date: 'Date', log_date: 'Date', session_date: 'Date', starts_at: 'Starts', ends_at: 'Ends',
  all_day: 'All day', applied_date: 'Applied on', sleep_minutes: 'Sleep (minutes)', water_ml: 'Water (ml)', weight_kg: 'Weight (kg)', duration_minutes: 'Duration (minutes)',
  duration_seconds: 'Duration (seconds)', target_minutes: 'Target (minutes)', recurrence_until: 'Repeats until', completed_at: 'Completed at', topic_id: 'Topic', goal_id: 'Goal',
  habit_id: 'Habit', routine_id: 'Routine', week_starts_on: 'Week starts on', monthly_budget_paise: 'Monthly budget', daily_study_target_minutes: 'Daily study target (minutes)',
}
const HIDDEN = new Set(['id', 'user_id', 'created_at', 'updated_at', 'series_id'])
export const fieldLabel = (f) => FIELD_LABELS[f] ?? f.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

/** A value as a short readable string. Money columns (…_paise) are shown in major units. */
export function formatValue(field, v) {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (/_paise$/.test(field) && typeof v === 'number') return (v / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ') : '—'
  if (typeof v === 'object') {
    const s = JSON.stringify(v)
    return s.length > 160 ? `${s.slice(0, 157)}…` : s
  }
  const s = String(v)
  return s === '' ? '(empty)' : s
}

/** The field-by-field comparison an event shows: for an update the changed fields; for a create the values it started with; for a delete what was removed. */
export function changeRows(ev) {
  const oldV = ev.old_values ?? {}
  const newV = ev.new_values ?? {}
  if (ev.operation === 'update' || (ev.changed_fields?.length ?? 0) > 0)
    return (ev.changed_fields ?? []).map((f) => ({ field: f, label: fieldLabel(f), before: formatValue(f, oldV[f]), after: formatValue(f, newV[f]), rawBefore: oldV[f], rawAfter: newV[f] }))
  const source = ev.operation === 'delete' ? oldV : newV
  return Object.keys(source)
    .filter((k) => !HIDDEN.has(k) && source[k] !== null && source[k] !== '' && !(Array.isArray(source[k]) && !source[k].length))
    .sort()
    .map((f) => ({
      field: f, label: fieldLabel(f),
      before: ev.operation === 'delete' ? formatValue(f, source[f]) : '—',
      after: ev.operation === 'delete' ? '—' : formatValue(f, source[f]),
      rawBefore: ev.operation === 'delete' ? source[f] : undefined, rawAfter: ev.operation === 'delete' ? undefined : source[f],
    }))
}

/** One plain sentence: what happened, to what. */
export function describeEvent(ev) {
  const meta = entityMeta(ev.entity)
  const what = ev.summary ? `${meta.label.toLowerCase()} “${ev.summary}”` : meta.label.toLowerCase()
  const fields = (ev.changed_fields ?? []).map(fieldLabel)
  const list = fields.length > 3 ? `${fields.slice(0, 3).join(', ')} and ${fields.length - 3} more` : fields.join(', ')
  switch (ev.action) {
    case 'create': return `Created ${what}`
    case 'update': return `Updated ${what}${list ? `: changed ${list.toLowerCase()}` : ''}`
    case 'delete': return `Deleted ${what}`
    case 'restore': return ev.operation === 'delete' ? `Restored deleted ${what}` : ev.operation === 'insert' ? `Re-created ${what}` : `Restored earlier values of ${what}${list ? ` (${list.toLowerCase()})` : ''}`
    case 'config': return ev.entity === 'user_settings' ? `Changed settings${list ? `: ${list.toLowerCase()}` : ''}` : ev.summary || `Changed ${meta.label.toLowerCase()} configuration`
    default: return ev.summary || `${AUDIT_ACTIONS[ev.action]?.label ?? ev.action} ${meta.label.toLowerCase()}`
  }
}

/** Can the "Restore" button be offered? (The database decides for real: it re-checks everything, including conflicts.) */
export function canOfferRestore(ev) {
  return (ev.operation === 'update' || ev.operation === 'delete') && !ev.truncated && ev.entity !== 'user_settings' && AUDIT_ENTITIES[ev.entity] != null && /^[0-9a-f-]{36}$/.test(ev.record_id ?? '')
}

export const RESTORE_REASONS = {
  not_found: 'That event could not be found.',
  unsupported: 'This kind of event cannot be restored.',
  truncated: 'This event kept only part of a long text, so it cannot be restored safely.',
  created: 'A created record has nothing to restore.',
  exists: 'This record exists again, so there is nothing to restore.',
  missing: 'This record has been deleted since. Restore its deletion first.',
  conflict: 'This record was changed after that event. Restoring would overwrite newer data, so nothing was changed.',
  dependency: 'A record this one belongs to no longer exists. Restore that first.',
  duplicate: 'Restoring would duplicate something that exists now.',
  invalid: 'The old values no longer pass the current rules.',
  locked: 'This part of LifeTrack is locked. Unlock it and try again.',
}

/** Rows for a CSV/Excel export of events (no values: the export is the log, not a copy of the data). */
export function auditExportRows(events) {
  return events.map((e) => ({
    time: e.occurred_at, action: e.action, module: entityMeta(e.entity).module, entity: entityMeta(e.entity).label, record_id: e.record_id ?? '', description: describeEvent(e),
    changed_fields: (e.changed_fields ?? []).join('; '), source: SOURCES[e.source] ?? e.source, request_id: e.request_id ?? '', event_id: e.id,
  }))
}
