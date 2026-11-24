import { useEffect, useSyncExternalStore } from 'react'
import { db } from '@/services/db'
import { patch, tracked } from '@/hooks/store'
import { isNewAccount, normalizeOnboarding } from '@/lib/onboarding'
import { useAuth } from './useAuth'
import { useSettings } from './useSettings'

// Onboarding progress, tour results and "already offered" flags. Same approach as the appearance store: a tiny store of its own so the screen
// reacts in the same frame, a copy in this browser (keyed by account, so two people sharing a browser never see each other's progress) and
// the account copy written a moment later. A failed account write (e.g. the migration has not been run yet) keeps working on this device.
const KEY = (uid) => `lifetrack:onboarding:${uid}`
const read = (uid) => {
  try {
    return normalizeOnboarding(JSON.parse(localStorage.getItem(KEY(uid)) ?? '{}'))
  } catch {
    return normalizeOnboarding({})
  }
}

let uid = null
let state = normalizeOnboarding({})
const subs = new Set()
const emit = () => subs.forEach((f) => f())
const subscribe = (f) => (subs.add(f), () => subs.delete(f))
let lastRemote = null // JSON of the account copy we last read or wrote, so echoes of our own write are not taken for another device's change
let timer = null

// Automated tests (unit and browser) set this so a brand-new test account is not covered by the welcome dialog. It never touches a real account's
// saved progress: it only changes what a new, undecided account starts as.
export const automationSkip = () => {
  try {
    return localStorage.getItem('lifetrack:onboarding:skip') === '1'
  } catch {
    return false
  }
}

const hasDecision = (s) => s.status !== undefined

async function pushToAccount() {
  const body = state
  try {
    const rows = await tracked(() => db.upsert('user_settings', [{ onboarding_state: body }], { onConflict: 'user_id' }))
    lastRemote = JSON.stringify(body)
    patch('user_settings', rows)
  } catch {
    /* progress stays on this device; nothing the person did is lost */
  }
}

function commit(next) {
  state = next
  if (uid) {
    try {
      localStorage.setItem(KEY(uid), JSON.stringify(state))
    } catch {
      /* private mode: the account copy still holds it */
    }
  }
  emit()
  clearTimeout(timer)
  timer = setTimeout(pushToAccount, 400)
}

/** Change part of the saved state. `answers`, `tours` and `offered` merge; the rest replaces. */
export function updateOnboarding(change) {
  commit(
    normalizeOnboarding({
      ...state,
      ...change,
      answers: { ...state.answers, ...(change.answers ?? {}) },
      tours: { ...state.tours, ...(change.tours ?? {}) },
      offered: { ...state.offered, ...(change.offered ?? {}) },
    }),
  )
}

/** Open onboarding again (from Settings), at the step where the person left off. */
export const resumeOnboarding = () => updateOnboarding({ status: 'in_progress' })
export const putOffOnboarding = () => updateOnboarding({ status: 'later' })
export const finishOnboarding = () => updateOnboarding({ status: 'done', step: 0 })
/** Clear a tour's result so it can be taken again. */
export const restartTour = (key) => {
  const { [key]: _gone, ...tours } = state.tours
  const { [key]: _o, ...offered } = state.offered
  commit(normalizeOnboarding({ ...state, tours, offered }))
}

export const useOnboarding = () => useSyncExternalStore(subscribe, () => state)

/** Mount once in the signed-in shell: loads this account's progress, adopts the account copy, and decides whether a new account starts onboarding. */
export function useOnboardingSync() {
  const { user } = useAuth()
  const { row, loading, settings } = useSettings()
  const remote = settings.onboarding_state
  const id = user?.id ?? null

  useEffect(() => {
    if (id === uid) return
    uid = id
    lastRemote = null
    state = id ? read(id) : normalizeOnboarding({})
    emit()
  }, [id])

  useEffect(() => {
    if (!id || loading || uid !== id) return
    const json = JSON.stringify(remote ?? {})
    if (json === lastRemote) return
    lastRemote = json
    const fromAccount = normalizeOnboarding(remote)
    if (hasDecision(fromAccount)) {
      if (JSON.stringify(fromAccount) !== JSON.stringify(state)) {
        state = fromAccount
        try {
          localStorage.setItem(KEY(id), JSON.stringify(state))
        } catch {
          /* ignore */
        }
        emit()
      }
      return
    }
    // The account has not decided yet. Keep what this device already knows; otherwise a brand-new account starts onboarding and an
    // account that has been used before is marked as existing, so nobody who has been here for months is walked through a welcome.
    if (!hasDecision(state)) state = { ...state, status: isNewAccount(row) && !automationSkip() ? 'in_progress' : 'existing' }
    commit(state)
  }, [id, loading, remote, row])
}
