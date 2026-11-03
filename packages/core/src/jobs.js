import { addDays, dateStrInTz, fmtDay, startOfWeek } from '@lifetrack/utils'

export const JOB_STATUSES = ['interested', 'preparing', 'applied', 'assessment', 'interview', 'selected', 'offer', 'rejected', 'withdrawn']
export const STATUS_LABEL = { ...Object.fromEntries(JOB_STATUSES.map((s) => [s, s[0].toUpperCase() + s.slice(1)])), interested: 'Wishlist' }
export const OPEN_STATUSES = ['interested', 'preparing', 'applied', 'assessment', 'interview']
const APPLIED_OR_BEYOND = ['applied', 'assessment', 'interview', 'selected', 'offer']
const INTERVIEW_OR_BEYOND = ['interview', 'selected', 'offer']

/** Statuses an application has EVER been in, from its immutable history (plus its current status). */
export function everStatuses(app, history) {
  const s = new Set([app.status])
  for (const h of history) if (h.application_id === app.id) s.add(h.to_status)
  return s
}

/**
 * Funnel metrics for applications whose applied_date is in [from,to].
 * conversion = applications that ever reached an interview / applications actually submitted. null when nothing was applied.
 */
export function funnel(apps, history, events, from, to) {
  const cohort = apps.filter((a) => a.applied_date && a.applied_date >= from && a.applied_date <= to)
  const evApps = new Set(events.map((e) => e.application_id))
  const reached = (a, list) => [...everStatuses(a, history)].some((s) => list.includes(s))
  const applied = cohort.filter((a) => reached(a, APPLIED_OR_BEYOND) || a.applied_date).length
  const interviews = cohort.filter((a) => reached(a, INTERVIEW_OR_BEYOND) || evApps.has(a.id)).length
  const rejections = cohort.filter((a) => everStatuses(a, history).has('rejected')).length
  const offers = cohort.filter((a) => { const e = everStatuses(a, history); return e.has('selected') || e.has('offer') }).length
  return { applied, interviews, rejections, offers, conversion: applied ? interviews / applied : null }
}

export function applicationsPerDay(apps, days) {
  const m = new Map()
  for (const a of apps) if (a.applied_date) m.set(a.applied_date, (m.get(a.applied_date) ?? 0) + 1)
  return days.map((date) => ({ date, count: m.get(date) ?? 0 }))
}

/** Salary progression: packages of applications over time (by applied date, falling back to created date). */
export function salaryProgression(apps, tz) {
  return apps
    .filter((a) => a.salary_paise)
    .map((a) => ({ date: a.applied_date ?? dateStrInTz(a.created_at, tz), company: a.company, lpa: a.salary_paise / 100 / 100000, status: a.status }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function dueFollowups(apps, today) {
  return apps
    .filter((a) => a.followup_date && a.followup_date <= today && OPEN_STATUSES.includes(a.status))
    .sort((a, b) => a.followup_date.localeCompare(b.followup_date))
}

export const DEFAULT_PREP = ['Research the company', 'Review the job description', 'Revise core skills for the role', 'Practice DSA problems', 'Prepare project walkthroughs', 'Prepare questions to ask', 'Test video/audio setup']

// ---- presentation helpers shared by the Job screens
export const STATUS_TONE = { selected: 'success', offer: 'success', rejected: 'danger', withdrawn: 'neutral', interview: 'primary', assessment: 'warning' }
export const statusTone = (s) => STATUS_TONE[s] ?? 'neutral'
export const isOpenStatus = (s) => OPEN_STATUSES.includes(s)
export const applicationSources = (apps) => [...new Set(apps.map((a) => a.source).filter(Boolean))]

/** Search + status + source filter; newest first. */
export function filterApplications(apps, { q = '', status = '', source = '' } = {}) {
  const s = q.trim().toLowerCase()
  return apps
    .filter((a) => (!status || a.status === status) && (!source || a.source === source) && (!s || [a.company, a.job_title, a.location, a.notes, a.contact_person].some((x) => x?.toLowerCase().includes(s))))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

/** Headline numbers + reminders. `nowMs` is injected so the "next 7 days" window is testable. */
export function jobsOverview(apps, history, events, today, weekStartsOn = 1, nowMs = Date.now()) {
  const weekStart = startOfWeek(today, weekStartsOn)
  const f = funnel(apps, history, events, '0000-01-01', '9999-12-31')
  const now = new Date(nowMs).toISOString(), soon = new Date(nowMs + 7 * 864e5).toISOString()
  return {
    thisWeek: apps.filter((a) => a.applied_date && a.applied_date >= weekStart && a.applied_date <= addDays(weekStart, 6)).length,
    funnel: f,
    active: apps.filter((a) => isOpenStatus(a.status)).length,
    total: apps.length,
    followups: dueFollowups(apps, today),
    upcoming: events.filter((e) => e.status === 'scheduled' && e.scheduled_at >= now && e.scheduled_at <= soon)
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
      .map((e) => ({ ...e, app: apps.find((a) => a.id === e.application_id) })).filter((e) => e.app),
  }
}

export function weeklyApplications(apps, today, weekStartsOn, weeks = 8) {
  const start = startOfWeek(today, weekStartsOn)
  return Array.from({ length: weeks }, (_, i) => {
    const ws = addDays(start, -(weeks - 1 - i) * 7)
    const we = addDays(ws, 6)
    return { label: fmtDay(ws, 'd MMM'), count: apps.filter((a) => a.applied_date && a.applied_date >= ws && a.applied_date <= we).length }
  })
}

export const prepProgress = (checklist) => { const total = checklist.length, done = checklist.filter((i) => i.done).length; return { done, total, percent: total ? Math.round((done / total) * 100) : 0 } }
export const applicationHistory = (appId, history) => history.filter((h) => h.application_id === appId).sort((a, b) => a.changed_at.localeCompare(b.changed_at))
export const applicationEvents = (appId, events) => events.filter((e) => e.application_id === appId).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
export const interviewTone = (status) => (status === 'completed' ? 'success' : status === 'cancelled' ? 'neutral' : 'primary')

/** Interviews grouped by local date (in `tz`): upcoming scheduled first (soonest first), then past (most recent first). */
export function interviewAgenda(events, apps, tz, nowMs = Date.now()) {
  const now = new Date(nowMs).toISOString()
  const withApp = events.map((e) => ({ ...e, app: apps.find((a) => a.id === e.application_id) })).filter((e) => e.app)
  const group = (list) => { const m = new Map(); for (const e of list) { const d = dateStrInTz(e.scheduled_at, tz); m.set(d, [...(m.get(d) ?? []), e]) } return [...m.entries()].map(([date, items]) => ({ date, items })) }
  const upcoming = withApp.filter((e) => e.scheduled_at >= now && e.status === 'scheduled').sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
  const past = withApp.filter((e) => !(e.scheduled_at >= now && e.status === 'scheduled')).sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))
  return { upcoming: group(upcoming), past: group(past) }
}
