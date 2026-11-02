import { describe, expect, it } from 'vitest'
import { filterApplications, interviewAgenda, prepProgress } from '@lifetrack/core/jobs'
import { applicationFormSchema, applicationToPayload, blankApplication, blankInterview, interviewFormSchema, interviewToPayload } from '@lifetrack/schemas'
import { setup } from './helpers'

const TODAY = '2026-11-02', TZ = 'Asia/Kolkata'
const app = (o: object) => applicationToPayload(applicationFormSchema.parse({ ...blankApplication('interested', TODAY), company: 'Acme', job_title: 'Dev', ...o }))

describe('job flows', () => {
  it('adds an application with the package as exact paise and finds it by search', async () => {
    const { store, tables } = setup()
    await store.insert('job_applications', app({ salary_lpa: '18.5', location: 'Pune' }))
    expect(tables.job_applications[0]).toMatchObject({ salary_paise: 185000000, status: 'interested', applied_date: null })
    expect(filterApplications(store.peek('job_applications') as any, { q: 'pune' })).toHaveLength(1)
  })
  it('moving to Applied stamps the applied date once and never overwrites an existing one', async () => {
    const { store, api, tables } = setup()
    const a = await store.insert('job_applications', app({})) as any
    await api.setApplicationStatus(a, 'applied', TODAY)
    expect(tables.job_applications[0]).toMatchObject({ status: 'applied', applied_date: TODAY })
    await api.setApplicationStatus({ ...tables.job_applications[0] }, 'interview', '2026-11-09')
    await api.setApplicationStatus({ ...tables.job_applications[0] }, 'applied', '2026-11-15')
    expect(tables.job_applications[0].applied_date).toBe(TODAY)
  })
  it('rejects an invalid URL before it reaches the database', () => {
    expect(applicationFormSchema.safeParse({ ...blankApplication('interested', TODAY), company: 'A', job_title: 'B', jd_url: 'javascript:alert(1)' }).success).toBe(false)
  })
  it('prep checklist persists as JSON and progress follows', async () => {
    const { store, tables } = setup()
    const a = await store.insert('job_applications', app({})) as any
    const list = [{ id: 'a', text: 'Research', done: true }, { id: 'b', text: 'Practice', done: false }]
    await store.update('job_applications', a.id, { prep_checklist: list })
    expect(prepProgress(tables.job_applications[0].prep_checklist)).toEqual({ done: 1, total: 2, percent: 50 })
    await expect(store.update('job_applications', a.id, { prep_checklist: [{ id: 'x', text: 1 }] })).rejects.toThrow(/Invalid update payload/)
  })
  it('schedules an interview in the user timezone and it appears in the agenda', async () => {
    const { store, tables } = setup()
    const a = await store.insert('job_applications', app({})) as any
    const v = interviewFormSchema.parse({ ...blankInterview(a.id, '2026-11-05'), time: '16:30', round_name: 'Tech' })
    await store.insert('interview_events', interviewToPayload(v, TZ))
    expect(tables.interview_events[0].scheduled_at).toBe('2026-11-05T11:00:00.000Z')
    const ag = interviewAgenda(store.peek('interview_events') as any, store.peek('job_applications') as any, TZ, Date.parse('2026-11-02T00:00:00Z')) as any
    expect(ag.upcoming.map((g: any) => g.date)).toEqual(['2026-11-05'])
    expect(ag.upcoming[0].items[0].app.company).toBe('Acme')
  })
  it('deleting an application removes it from the cache', async () => {
    const { store } = setup()
    const a = await store.insert('job_applications', app({})) as any
    await store.remove('job_applications', a.id)
    expect(store.peek('job_applications')).toHaveLength(0)
  })
})
