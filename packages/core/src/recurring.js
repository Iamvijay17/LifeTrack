// Recurring transactions: when a rule falls due and what posting it changes. No I/O; api.postDueRecurring does the writing.
import { addDays, addMonths, fmtDay, monthEnd } from '@lifetrack/utils'

export const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
]
/** One run posts at most this many occurrences per rule (a daily rule started years ago); the next run carries on from there. */
export const MAX_CATCH_UP = 60

const inMonths = (date, n, anchorDay) => {
  const first = addMonths(date.slice(0, 7) + '-01', n)
  const day = Math.min(anchorDay, Number(monthEnd(first).slice(8)))
  return first.slice(0, 8) + String(day).padStart(2, '0')
}

/** The occurrence after `date`. Months and years aim for `anchorDay` each time, so a rule on the 31st goes Jan 31, Feb 28, Mar 31 instead of sticking to the 28th. */
export function nextRecurringDate(date, frequency, anchorDay) {
  switch (frequency) {
    case 'daily':
      return addDays(date, 1)
    case 'weekly':
      return addDays(date, 7)
    case 'monthly':
      return inMonths(date, 1, anchorDay)
    case 'yearly':
      return inMonths(date, 12, anchorDay)
    default:
      return null
  }
}

const isPastEnd = (rule, date) => !!rule.end_date && date > rule.end_date

/** Dates still owed by a rule, oldest first: every missed day is posted on its own date, up to today and the rule's end date. Paused rules owe nothing. */
export function dueOccurrences(rule, today, cap = MAX_CATCH_UP) {
  if (!rule.active) return []
  const out = []
  for (let d = rule.next_date; d <= today && !isPastEnd(rule, d) && out.length < cap; d = nextRecurringDate(d, rule.frequency, rule.anchor_day)) out.push(d)
  return out
}

export const dueRules = (rules, today) => rules.filter((r) => dueOccurrences(r, today, 1).length > 0)

/** What to store on the rule once `lastPosted` is posted. A rule with nothing left before its end date switches off. */
export function afterPost(rule, lastPosted) {
  const next = nextRecurringDate(lastPosted, rule.frequency, rule.anchor_day)
  return { next_date: next, ...(isPastEnd(rule, next) ? { active: false } : {}) }
}

/** The transaction for one occurrence. `recurring_date` stays put if the user later moves the transaction to another day. */
export const occurrenceRow = (rule, date) => ({
  type: rule.type,
  amount_paise: rule.amount_paise,
  category: rule.category,
  payment_method: rule.payment_method,
  note: rule.note,
  txn_date: date,
  recurring_rule_id: rule.id,
  recurring_date: date,
})

/** Pausing keeps the schedule. Resuming skips what fell due during the pause: those charges were paused on purpose, so they are not back-posted. */
export function togglePatch(rule, today) {
  if (rule.active) return { active: false }
  let next = rule.next_date
  while (next < today) next = nextRecurringDate(next, rule.frequency, rule.anchor_day)
  return { active: true, next_date: next }
}

// ---- presentation helpers shared by web and mobile
export const frequencyLabel = (frequency) => FREQUENCIES.find((f) => f.value === frequency)?.label
export const ruleTitle = (rule) => rule.note || rule.category
/** 'ended' has nothing left to post (only a later end date revives it), 'paused' can be resumed. */
export const ruleStatus = (rule) => (isPastEnd(rule, rule.next_date) ? 'ended' : rule.active ? 'active' : 'paused')
const longDay = (date) => fmtDay(date, 'd MMM yyyy')
/** "Next 1 Dec 2026 · until 31 Mar 2027", "Paused" or "Ended 31 Mar 2027". */
export function ruleSchedule(rule) {
  const status = ruleStatus(rule)
  if (status === 'paused') return 'Paused'
  if (status === 'ended') return `Ended ${longDay(rule.end_date)}`
  return `Next ${longDay(rule.next_date)}${rule.end_date ? ` · until ${longDay(rule.end_date)}` : ''}`
}
/** Running rules first, soonest first, then paused, then ended. */
const STATUS_ORDER = { active: 0, paused: 1, ended: 2 }
export const sortRules = (rules) => [...rules].sort((a, b) => STATUS_ORDER[ruleStatus(a)] - STATUS_ORDER[ruleStatus(b)] || a.next_date.localeCompare(b.next_date))
