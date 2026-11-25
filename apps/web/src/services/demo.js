// Demo mode: the whole app runs on a separate, in-memory database filled with generated sample data.
//
// Why this cannot touch real data: while demo mode is on, services/db.js sends every read and write to this memory database instead of the real
// one (there is no flag a feature can forget to check), the offline layer is stopped so nothing is cached on disk or queued for the server, and
// live updates from the real database are ignored. The memory is plain JavaScript state in this tab: reloading the page, signing out or choosing
// "Exit demo" ends it, and the real data is exactly as it was.
import { useSyncExternalStore } from 'react'
import { demoStages } from '@/lib/demoData'
import { todayStr } from '@/lib/dates'
import * as sync from '@/sync'
import { getUserId } from './session'

let adapter = null
let active = false
let seeded = null // { at, counts } of the data currently in the adapter
const subs = new Set()
const emit = () => subs.forEach((f) => f())
const subscribe = (f) => (subs.add(f), () => subs.delete(f))
// Set by hooks/store.js so this module does not import it (the store imports the database, which imports this module).
let storeHooks = { reset: () => {} }
export const bindDemoStore = (hooks) => {
  storeHooks = hooks
}

export const isDemo = () => active
/** The memory database to use while demo mode is on, or null. services/db.js is the only caller. */
export const demoAdapter = () => (active ? adapter : null)
export const useDemo = () => useSyncExternalStore(subscribe, () => active)
export const useDemoInfo = () => useSyncExternalStore(subscribe, () => seeded)

async function fill(fresh) {
  const stages = demoStages(todayStr())
  const made = {}
  const counts = {}
  // The settings row first, marked as already set up, so the app does not run its first-sign-in setup (which would add real defaults).
  await fresh.insert('user_settings', [
    {
      defaults_seeded: true,
      currency: 'INR',
      theme: 'dark',
      daily_study_target_minutes: 90,
      monthly_budget_paise: 6000000,
      onboarding_state: { status: 'existing' },
    },
  ])
  for (const { table, rows } of stages) {
    const input = typeof rows === 'function' ? rows(made) : rows
    made[table] = await fresh.insert(table, input)
    counts[table] = input.length
  }
  return counts
}

async function build() {
  const { createDemoAdapter } = await import('./demoAdapter') // loaded only when demo mode is first used
  const fresh = createDemoAdapter()
  const counts = await fill(fresh)
  return { fresh, counts }
}

/** Switch to the demo database. Nothing in the real account is read again until the demo ends. */
export async function enterDemo() {
  if (active) return
  const { fresh, counts } = await build() // built before anything is switched, so a failure leaves the real app untouched
  sync.stop() // no offline cache, no outbox: demo rows are never written to disk or sent anywhere
  adapter = fresh
  seeded = { at: Date.now(), counts }
  active = true
  storeHooks.reset()
  emit()
}

/** Replace the demo with a fresh copy of the sample data (your edits to it are discarded). */
export async function resetDemo() {
  if (!active) return
  const { fresh, counts } = await build()
  adapter = fresh
  seeded = { at: Date.now(), counts }
  storeHooks.reset()
  emit()
}

/** Back to the real account. The demo memory is dropped. */
export async function exitDemo() {
  if (!active) return
  active = false
  adapter = null
  seeded = null
  storeHooks.reset()
  const uid = getUserId()
  if (uid) await sync.start(uid) // the offline layer comes back, with whatever was waiting in its outbox before the demo
  emit()
}
