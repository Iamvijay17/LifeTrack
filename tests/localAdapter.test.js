import { beforeEach, describe, expect, it } from 'vitest'
import { localAdapter as db } from '@/services/localAdapter'
import { setUserId } from '@/services/session'

beforeEach(() => { localStorage.clear(); setUserId('user-a') })

describe('local dev adapter mirrors the database contract', () => {
  it('applies defaults, ids and timestamps', async () => {
    const [t] = await db.insert('tasks', [{ title: 'x' }])
    expect(t).toMatchObject({ title: 'x', status: 'pending', priority: 'medium', recurrence: 'none', user_id: 'user-a' })
    expect(t.id).toBeTruthy(); expect(t.created_at).toBeTruthy()
  })
  it('isolates users', async () => {
    await db.insert('tasks', [{ title: 'mine' }])
    setUserId('user-b')
    expect(await db.list('tasks')).toHaveLength(0)
  })
  it('enforces unique habit completion per day (upsert is idempotent)', async () => {
    const [h] = await db.insert('habits', [{ name: 'h', start_date: '2026-01-01' }])
    await db.insert('habit_logs', [{ habit_id: h.id, log_date: '2026-01-01' }])
    await expect(db.insert('habit_logs', [{ habit_id: h.id, log_date: '2026-01-01' }])).rejects.toMatchObject({ code: '23505' })
    await db.upsert('habit_logs', [{ habit_id: h.id, log_date: '2026-01-01', status: 'skipped' }], { onConflict: 'habit_id,log_date' })
    const logs = await db.list('habit_logs')
    expect(logs).toHaveLength(1); expect(logs[0].status).toBe('skipped')
  })
  it('allows only one running study timer', async () => {
    await db.insert('study_sessions', [{ status: 'running', session_date: '2026-01-01' }])
    await expect(db.insert('study_sessions', [{ status: 'running', session_date: '2026-01-01' }])).rejects.toMatchObject({ code: '23505' })
  })
  it('records application status history, like the DB trigger', async () => {
    const [a] = await db.insert('job_applications', [{ company: 'A', job_title: 'B' }])
    await db.update('job_applications', a.id, { status: 'applied' })
    await db.update('job_applications', a.id, { notes: 'no status change' })
    const h = await db.list('application_history')
    expect(h.map((x) => [x.from_status, x.to_status])).toEqual([[null, 'interested'], ['interested', 'applied']])
    expect(h[0].changed_at).toBeTruthy()
  })
  it('recurring task occurrences are unique per (series, date)', async () => {
    await db.insert('tasks', [{ title: 'r', series_id: 's', due_date: '2026-01-01' }])
    await expect(db.insert('tasks', [{ title: 'r', series_id: 's', due_date: '2026-01-01' }])).rejects.toMatchObject({ code: '23505' })
  })
  it('cascades deletes like the schema', async () => {
    const [a] = await db.insert('job_applications', [{ company: 'A', job_title: 'B' }])
    await db.remove('job_applications', a.id)
    expect(await db.list('application_history')).toHaveLength(0)
  })
})
