import { describe, expect, it } from 'vitest'
import { applicationEvents, applicationHistory, applicationSources, filterApplications, interviewAgenda, jobsOverview, prepProgress, statusTone, weeklyApplications } from '../src/jobs'

const A = (o) => ({ id: o.id, company: o.id, job_title: 'Dev', status: 'interested', created_at: '2026-10-01T00:00:00Z', applied_date: null, followup_date: null, source: '', ...o })
const apps = [
  A({ id: 'acme', status: 'applied', applied_date: '2026-11-02', source: 'LinkedIn', created_at: '2026-10-05T00:00:00Z', location: 'Pune' }),
  A({ id: 'beta', status: 'interview', applied_date: '2026-10-20', source: 'Referral', created_at: '2026-10-10T00:00:00Z', followup_date: '2026-11-01', notes: 'Nice team' }),
  A({ id: 'gamma', status: 'rejected', applied_date: '2026-10-01', created_at: '2026-10-01T00:00:00Z', followup_date: '2026-10-01' }),
]
const history = [{ application_id: 'beta', to_status: 'applied', changed_at: '2026-10-20T00:00:00Z' }, { application_id: 'beta', from_status: 'applied', to_status: 'interview', changed_at: '2026-10-25T00:00:00Z' }, { application_id: 'gamma', to_status: 'applied', changed_at: '2026-10-01T00:00:00Z' }, { application_id: 'gamma', from_status: 'applied', to_status: 'rejected', changed_at: '2026-10-05T00:00:00Z' }]
const NOW = Date.parse('2026-11-02T06:00:00Z')
const events = [
  { id: 'e1', application_id: 'beta', status: 'scheduled', scheduled_at: '2026-11-04T05:30:00Z', round_name: 'Tech' },
  { id: 'e2', application_id: 'beta', status: 'scheduled', scheduled_at: '2026-11-20T05:30:00Z', round_name: 'HR' },
  { id: 'e3', application_id: 'gamma', status: 'completed', scheduled_at: '2026-10-03T05:30:00Z', round_name: 'Phone' },
  { id: 'e4', application_id: 'gone', status: 'scheduled', scheduled_at: '2026-11-03T05:30:00Z', round_name: 'Orphan' },
]
describe('filters', () => {
  it('searches across fields, filters, and sorts newest first', () => {
    expect(filterApplications(apps).map((a) => a.id)).toEqual(['beta', 'acme', 'gamma'])
    expect(filterApplications(apps, { q: 'PUNE' }).map((a) => a.id)).toEqual(['acme'])
    expect(filterApplications(apps, { q: 'nice' }).map((a) => a.id)).toEqual(['beta'])
    expect(filterApplications(apps, { status: 'rejected' }).map((a) => a.id)).toEqual(['gamma'])
    expect(filterApplications(apps, { source: 'Referral' }).map((a) => a.id)).toEqual(['beta'])
    expect(applicationSources(apps).sort()).toEqual(['LinkedIn', 'Referral'])
  })
})
describe('overview', () => {
  const o = jobsOverview(apps, history, events, '2026-11-02', 1, NOW)
  it('counts the week, pipeline and funnel', () => {
    expect(o.thisWeek).toBe(1)
    expect(o.active).toBe(2)
    expect(o.total).toBe(3)
    expect(o.funnel).toMatchObject({ applied: 3, interviews: 2, rejections: 1 })
  })
  it('lists due follow-ups for open applications only, and the next 7 days of interviews that have an application', () => {
    expect(o.followups.map((a) => a.id)).toEqual(['beta'])
    expect(o.upcoming.map((e) => e.id)).toEqual(['e1'])
  })
  it('weekly series covers the last 8 weeks ending this week', () => {
    const w = weeklyApplications(apps, '2026-11-02', 1)
    expect(w).toHaveLength(8)
    expect(w.at(-1)).toEqual({ label: '2 Nov', count: 1 })
    expect(w.reduce((a, x) => a + x.count, 0)).toBe(3)
  })
})
describe('detail helpers', () => {
  it('orders history and events, summarises prep, groups the agenda', () => {
    expect(applicationHistory('beta', history).map((h) => h.to_status)).toEqual(['applied', 'interview'])
    expect(applicationEvents('beta', events).map((e) => e.id)).toEqual(['e1', 'e2'])
    expect(prepProgress([{ done: true }, { done: false }, { done: true }])).toEqual({ done: 2, total: 3, percent: 67 })
    expect(prepProgress([])).toEqual({ done: 0, total: 0, percent: 0 })
    const ag = interviewAgenda(events, apps, 'Asia/Kolkata', NOW)
    expect(ag.upcoming.map((g) => g.date)).toEqual(['2026-11-04', '2026-11-20'])
    expect(ag.past.map((g) => g.items[0].id)).toEqual(['e3'])
    expect([...ag.upcoming, ...ag.past].flatMap((g) => g.items).some((e) => e.id === 'e4')).toBe(false) // no orphan interviews
    expect(['selected', 'rejected', 'interview', 'assessment', 'interested'].map(statusTone)).toEqual(['success', 'danger', 'primary', 'warning', 'neutral'])
  })
})
