import { describe, expect, it } from 'vitest'
import { applicationFormSchema, applicationToForm, applicationToPayload, blankApplication, blankInterview, insertSchemas, interviewFormSchema, interviewToForm, interviewToPayload } from '../src'

describe('application form', () => {
  const base = blankApplication('interested', '2026-11-02')
  it('requires company/title and a valid URL and package', () => {
    expect(applicationFormSchema.safeParse(base).success).toBe(false)
    const ok = { ...base, company: 'Acme', job_title: 'Dev' }
    expect(applicationFormSchema.safeParse(ok).success).toBe(true)
    expect(applicationFormSchema.safeParse({ ...ok, jd_url: 'ftp://x' }).success).toBe(false)
    expect(applicationFormSchema.safeParse({ ...ok, jd_url: 'https://x.dev/job' }).success).toBe(true)
    expect(applicationFormSchema.safeParse({ ...ok, salary_lpa: 'lots' }).success).toBe(false)
  })
  it('defaults the applied date only for the Applied column and maps LPA to paise', () => {
    expect(blankApplication('applied', '2026-11-02').applied_date).toBe('2026-11-02')
    expect(blankApplication('interested', '2026-11-02').applied_date).toBe('')
    const p = applicationToPayload(applicationFormSchema.parse({ ...base, company: 'Acme', job_title: 'Dev', salary_lpa: '18.5', status: 'applied', applied_date: '2026-11-02' }))
    expect(p.salary_paise).toBe(185000000)
    expect(p).not.toHaveProperty('salary_lpa')
    expect(insertSchemas.job_applications.safeParse(p).success).toBe(true)
    expect(applicationToPayload(applicationFormSchema.parse({ ...base, company: 'A', job_title: 'B' }))).toMatchObject({ salary_paise: null, applied_date: null, followup_date: null })
    expect(applicationToForm({ company: 'X', job_title: 'Y', salary_paise: 185000000, notes: null })).toMatchObject({ company: 'X', salary_lpa: '18.5', notes: '' })
  })
})
describe('interview form', () => {
  const id = crypto.randomUUID()
  it('converts local date/time in the user timezone to UTC and back', () => {
    const v = interviewFormSchema.parse({ ...blankInterview(id, '2026-11-05'), time: '16:30' })
    const p = interviewToPayload(v, 'Asia/Kolkata')
    expect(p.scheduled_at).toBe('2026-11-05T11:00:00.000Z')
    expect(p).not.toHaveProperty('date')
    expect(insertSchemas.interview_events.safeParse(p).success).toBe(true)
    expect(interviewToForm({ ...p, application_id: id, round_name: v.round_name, mode: 'video', status: 'scheduled' }, 'Asia/Kolkata')).toMatchObject({ date: '2026-11-05', time: '16:30' })
  })
  it('requires an application, a round, a valid date and time', () => {
    expect(interviewFormSchema.safeParse(blankInterview('', '2026-11-05')).success).toBe(false)
    expect(interviewFormSchema.safeParse({ ...blankInterview(id, '2026-11-05'), time: '9:5' }).success).toBe(false)
    expect(interviewFormSchema.safeParse({ ...blankInterview(id, '2026-02-30') }).success).toBe(false)
  })
})
