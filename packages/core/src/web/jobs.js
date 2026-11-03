import { addDays, dateStrInTz, fmtDay, startOfWeek } from '@lifetrack/utils'
import { pct, uid } from '@lifetrack/utils'

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
  const offers = cohort.filter((a) => {
    const e = everStatuses(a, history)
    return e.has('selected') || e.has('offer')
  }).length
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
    .map((a) => ({
      date: a.applied_date ?? dateStrInTz(a.created_at, tz),
      company: a.company,
      lpa: a.salary_paise / 100 / 100000,
      status: a.status,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function dueFollowups(apps, today) {
  return apps
    .filter((a) => a.followup_date && a.followup_date <= today && OPEN_STATUSES.includes(a.status))
    .sort((a, b) => a.followup_date.localeCompare(b.followup_date))
}

export const DEFAULT_PREP = [
  'Research the company',
  'Review the job description',
  'Revise core skills for the role',
  'Practice DSA problems',
  'Prepare project walkthroughs',
  'Prepare questions to ask',
  'Test video/audio setup',
]

// ---------------------------------------------------------------- pipeline
export const isOpenApplication = (a) => OPEN_STATUSES.includes(a.status)
export const activePipelineCount = (apps) => apps.filter(isOpenApplication).length

/** A follow-up date has arrived (or passed) for an application that is still in play. */
export const isFollowupOverdue = (app, today) => !!app.followup_date && app.followup_date <= today && isOpenApplication(app)

export const applicationSources = (apps) => [...new Set(apps.map((a) => a.source).filter(Boolean))]

/** Applications applied for within the 7 days starting at `weekStart`. */
export const appliedInWeek = (apps, weekStart) =>
  apps.filter((a) => a.applied_date && a.applied_date >= weekStart && a.applied_date <= addDays(weekStart, 6)).length

/** Filter by status / source / free text (company, title, location, notes, contact); newest first. */
export function filterApplications(apps, { q = '', status = '', source = '' } = {}) {
  const s = q.trim().toLowerCase()
  return apps
    .filter(
      (a) =>
        (!status || a.status === status) &&
        (!source || a.source === source) &&
        (!s || [a.company, a.job_title, a.location, a.notes, a.contact_person].some((x) => x?.toLowerCase().includes(s))),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

/** Applications per week for the last `weeks` weeks (oldest first), for the insights chart. */
export function weeklyApplications(apps, today, weekStartsOn, weeks = 8) {
  const start = startOfWeek(today, weekStartsOn)
  return Array.from({ length: weeks }, (_, i) => {
    const ws = addDays(start, -(weeks - 1 - i) * 7)
    const we = addDays(ws, 6)
    return { label: fmtDay(ws, 'd MMM'), count: apps.filter((a) => a.applied_date && a.applied_date >= ws && a.applied_date <= we).length }
  })
}

// -------------------------------------------------------------- interviews
const DAY_MS = 864e5

/** Scheduled interviews in the next `days` days (from `nowMs`), each with its application attached; interviews whose application is gone are dropped. */
export function upcomingInterviews(events, apps, nowMs, days = 7) {
  const now = new Date(nowMs).toISOString()
  const soon = new Date(nowMs + days * DAY_MS).toISOString()
  return events
    .filter((e) => e.status === 'scheduled' && e.scheduled_at >= now && e.scheduled_at <= soon)
    .map((e) => ({ ...e, app: apps.find((a) => a.id === e.application_id) }))
    .filter((e) => e.app)
}

/** Next scheduled interviews from `nowMs`, soonest first. */
export const nextInterviews = (events, nowMs, limit = 6) =>
  events
    .filter((e) => e.status === 'scheduled' && e.scheduled_at >= new Date(nowMs).toISOString())
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    .slice(0, limit)

/** Map of 'yyyy-MM-dd' (in the user's timezone) -> interviews that day, in time order. */
export function groupInterviewsByDay(events, tz) {
  const byDay = new Map()
  for (const e of [...events].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))) {
    const d = dateStrInTz(e.scheduled_at, tz)
    byDay.set(d, [...(byDay.get(d) ?? []), e])
  }
  return byDay
}

// ------------------------------------------------------- prep checklist (pure)
export const newChecklist = (texts = DEFAULT_PREP) => texts.map((text) => ({ id: uid(), text, done: false }))
export const addChecklistItem = (list, text) => {
  const t = text.trim()
  return t ? [...list, { id: uid(), text: t, done: false }] : list
}
export const toggleChecklistItem = (list, id, done) => list.map((x) => (x.id === id ? { ...x, done } : x))
export const removeChecklistItem = (list, id) => list.filter((x) => x.id !== id)
export const checklistProgress = (list) => {
  const done = list.filter((i) => i.done).length
  return { done, total: list.length, percent: pct(done, list.length) }
}
