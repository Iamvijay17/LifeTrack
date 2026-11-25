import { useEffect, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { db } from '@/services/db'
import { patch, tracked } from '@/hooks/store'
import { applyAppearance, normalizeAppearance, readStoredAppearance } from '@/lib/appearance'
import { useResolvedTheme } from './useTheme'
import { useSettings } from './useSettings'

// The preferences live in a tiny store of their own, because they must change the screen in the same frame (no waiting for a network round trip)
// and work before sign-in. The account copy is written a moment later; a failed write keeps the choice on this device and says so once.
let prefs = readStoredAppearance()
const subs = new Set()
const emit = () => subs.forEach((f) => f())
const subscribe = (f) => (subs.add(f), () => subs.delete(f))

let lastRemote = null // JSON of the account copy we last read or wrote, so echoes of our own write are not mistaken for another device's change
let timer = null
let warned = false

const dark = () => document.documentElement.classList.contains('dark')

async function pushToAccount() {
  const body = prefs
  try {
    const rows = await tracked(() => db.upsert('user_settings', [{ appearance_prefs: body }], { onConflict: 'user_id' }))
    lastRemote = JSON.stringify(body)
    patch('user_settings', rows)
  } catch {
    // Most often the account has not had the appearance migration yet: the choice still holds here.
    if (!warned) {
      warned = true
      toast.message('Saved on this device only', {
        description: "Your account couldn't store this yet, so other devices keep their own look.",
      })
    }
  }
}

/** Change one or more preferences: the screen updates now, the account a moment later. */
export function setAppearance(change) {
  const next = normalizeAppearance({ ...prefs, ...change, sidebar: { ...prefs.sidebar, ...(change.sidebar ?? {}) } })
  if (JSON.stringify(next) === JSON.stringify(prefs)) return
  prefs = next
  applyAppearance(prefs, dark())
  emit()
  clearTimeout(timer)
  timer = setTimeout(pushToAccount, 500)
}

export const resetAppearance = () => setAppearance({ ...normalizeAppearance({}), sidebar: { ...normalizeAppearance({}).sidebar } })

export const useAppearance = () => useSyncExternalStore(subscribe, () => prefs)

/** Mount once in the signed-in shell: applies the preferences, follows the theme, and adopts the account's copy (including changes from another device). */
export function useAppearanceSync() {
  const { row, settings } = useSettings()
  const current = useAppearance()
  const theme = useResolvedTheme()
  const remote = settings.appearance_prefs

  useEffect(() => {
    applyAppearance(current, theme === 'dark')
  }, [current, theme])

  useEffect(() => {
    if (!row) return
    const json = JSON.stringify(remote ?? {})
    if (json === lastRemote) return
    const empty = !remote || Object.keys(remote).length === 0
    lastRemote = json
    if (empty) {
      // A first sign-in on this account: a look chosen on this device before now is kept and sent up.
      if (JSON.stringify(prefs) !== JSON.stringify(normalizeAppearance({}))) {
        clearTimeout(timer)
        timer = setTimeout(pushToAccount, 0)
      }
      return
    }
    const next = normalizeAppearance(remote)
    if (JSON.stringify(next) !== JSON.stringify(prefs)) {
      prefs = next
      emit()
    }
  }, [row, remote])
}
