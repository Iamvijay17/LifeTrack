import { dateStrInTz } from '@/lib/dates'

export const JOB_STATUSES = ['interested', 'preparing', 'applied', 'assessment', 'interview', 'selected', 'rejected', 'withdrawn']
export const STATUS_LABEL = Object.fromEntries(JOB_STATUSES.map((s) => [s, s[0].toUpperCase() + s.slice(1)]))
export const OPEN_STATUSES = ['interested', 'preparing', 'applied', 'assessment', 'interview']
const APPLIED_OR_BEYOND = ['applied', 'assessment', 'interview', 'selected']
const INTERVIEW_OR_BEYOND = ['interview', 'selected']

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
  const offers = cohort.filter((a) => everStatuses(a, history).has('selected')).length
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
