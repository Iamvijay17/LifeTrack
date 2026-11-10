import { test } from '@playwright/test'
import { register } from './helpers'

const OUT = process.env.SHOTS
const seed = async (page) => {
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('lifetrack-dev:db:') && !k.endsWith(':null'))
    const uid = key.split(':').pop()
    const db = JSON.parse(localStorage.getItem(key))
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const add = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10) }
    const at = (d, hm) => new Date(`${d}T${hm}:00+05:30`).toISOString()
    let i = 0
    const row = (o) => ({ id: crypto.randomUUID(), user_id: uid, created_at: new Date(Date.now() + i++).toISOString(), updated_at: new Date().toISOString(), ...o })
    const T = (o) => row({ notes: '', category: 'Personal', priority: 'medium', status: 'pending', due_date: null, started_at: null, completed_at: null, recurrence: 'none', recurrence_until: null, series_id: null, start_time: null, end_time: null, color: null, location: '', alert_minutes: [], ...o })
    const E = (o) => row({ description: '', location: '', category: 'personal', category_label: '', priority: 'medium', color: null, all_day: false, timezone: 'Asia/Kolkata', rrule: null, alert_minutes: [], goal_id: null, topic_id: null, application_id: null, routine_id: null, ...o })
    db.tasks = [
      T({ title: 'Gym: push day', category: 'Gym', priority: 'high', due_date: today, start_time: '07:00', end_time: '08:15', location: 'Cult Gym' }),
      T({ title: 'Pay electricity bill', category: 'Finance', due_date: today }),
      T({ title: 'Review pull requests', category: 'Learning', due_date: today, status: 'done' }),
      T({ title: 'Send follow-up to recruiter', category: 'Job Search', priority: 'urgent', due_date: add(today, -2) }),
      T({ title: 'Read system design chapter', category: 'Learning', start_time: null }),
      T({ title: 'Book dentist', category: 'Health', priority: 'low' }),
      T({ title: 'Plan weekend trip', category: 'Personal', due_date: add(today, 2), start_time: '16:00', end_time: '17:00', alert_minutes: [60] }),
    ]
    db.calendar_events = [
      E({ title: 'Team standup', category: 'routine', starts_at: at(today, '10:00'), ends_at: at(today, '10:30'), rrule: { freq: 'weekly', byWeekday: [1, 2, 3, 4, 5] }, alert_minutes: [10] }),
      E({ title: 'Design review', category: 'learning', starts_at: at(today, '11:00'), ends_at: at(today, '12:30'), location: 'Room 4' }),
      E({ title: 'Client call', category: 'jobs', priority: 'high', starts_at: at(today, '11:30'), ends_at: at(today, '12:00') }),
      E({ title: 'Lunch with Priya', category: 'personal', color: '#10B981', starts_at: at(today, '13:15'), ends_at: at(today, '14:15'), location: 'Third Wave Coffee' }),
      E({ title: 'Product conference', category: 'custom', category_label: 'Conference', all_day: true, starts_at: at(add(today, 1), '00:00'), ends_at: at(add(today, 3), '00:00') }),
      E({ title: 'Yoga', category: 'health', starts_at: at(today, '18:30'), ends_at: at(today, '19:30'), rrule: { freq: 'weekly', byWeekday: [1, 3, 5] } }),
    ]
    localStorage.setItem(key, JSON.stringify(db))
  })
}


test('mobile shots', async ({ page }) => {
  await register(page)
  await seed(page)
  const shot = async (name, path, fn) => {
    await page.goto(path)
    await page.getByTestId('calendar').waitFor()
    await page.waitForTimeout(700)
    if (fn) await fn()
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
  }
  await shot('m-day', '/calendar?view=day', () => page.getByTestId('calendar-scroller').evaluate((el) => (el.scrollTop = 6 * 56)))
  await shot('m-week', '/calendar?view=week', () => page.getByTestId('calendar-scroller').evaluate((el) => (el.scrollTop = 6 * 56)))
  await shot('m-month', '/calendar?view=month')
  await shot('m-agenda', '/calendar?view=agenda')
  await shot('m-dialog', '/calendar?view=day', async () => { await page.getByRole('button', { name: /^New/ }).first().click(); await page.waitForTimeout(700) })
})
