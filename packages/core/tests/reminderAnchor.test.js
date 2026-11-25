import { describe, expect, it } from 'vitest'
import { afterFire, anchorDayOf, nextRemindDate, withAnchorDay } from '../src/reminders'

// A monthly reminder set for the 31st must come back to the 31st after a short month (it used to stay on the 28th for good).
describe('monthly and yearly reminders keep their day of the month', () => {
  it('31 Jan -> 28 Feb -> 31 Mar -> 30 Apr -> 31 May with an anchor', () => {
    let d = '2027-01-31'
    const seen = []
    for (let i = 0; i < 4; i++) seen.push((d = nextRemindDate(d, 'monthly', 31)))
    expect(seen).toEqual(['2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31'])
  })
  it('without an anchor it behaves as before (day of the date given)', () => {
    expect(nextRemindDate('2027-01-31', 'monthly')).toBe('2027-02-28')
    expect(nextRemindDate('2027-02-28', 'monthly')).toBe('2027-03-28')
  })
  it('29 Feb returns in the next leap year', () => {
    expect(nextRemindDate('2028-02-29', 'yearly', 29)).toBe('2029-02-28')
    expect(nextRemindDate('2029-02-28', 'yearly', 29)).toBe('2030-02-28')
    expect(nextRemindDate('2031-02-28', 'yearly', 29)).toBe('2032-02-29')
  })
  it('afterFire reads the stored anchor, so a drifted date does not drag the series down', () => {
    const r = { repeat: 'monthly', remind_date: '2027-02-28', anchor_day: 31, active: true }
    expect(afterFire(r, '2027-02-28')).toEqual({ last_fired_on: '2027-02-28', remind_date: '2027-03-31' })
  })
  it('afterFire falls back to the date for rows with no anchor and skips past today', () => {
    const r = { repeat: 'monthly', remind_date: '2027-01-15' }
    expect(afterFire(r, '2027-03-20')).toEqual({ last_fired_on: '2027-03-20', remind_date: '2027-04-15' })
  })
  it('anchorDayOf and withAnchorDay', () => {
    expect(anchorDayOf({ anchor_day: 31, remind_date: '2027-02-28' })).toBe(31)
    expect(anchorDayOf({ anchor_day: null, remind_date: '2027-02-28' })).toBe(28)
    expect(withAnchorDay({ remind_date: '2027-03-31', title: 'x' })).toEqual({ remind_date: '2027-03-31', title: 'x', anchor_day: 31 })
  })
})
