import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { withOrder, withSize, withVisibility } from '@lifetrack/core/commandCenter'
import { tracked } from '@/hooks/store'
import { toAppError } from '@/services/errors'

const SAVE_DELAY_MS = 300

/**
 * The dashboard layout (`user_settings.dashboard_widgets`) with instant feedback. A change shows at once and is written to the account a
 * moment later, so dragging, resizing and toggling several widgets is one request rather than one per click, and nothing waits on the network.
 * If the write fails the layout goes back to what is saved and the error is shown, so the screen never claims something that was not stored.
 *
 * @param saved the saved `dashboard_widgets` object (or undefined)
 * @param save  (patch) => Promise, writes a settings patch
 */
export function useDashboardLayout(saved, save) {
  const [draft, setDraft] = useState(null)
  const prefs = draft ?? saved ?? {}
  const latest = useRef(prefs)
  const dirty = useRef(false)
  const timer = useRef(null)
  const release = useRef(null)
  const saveRef = useRef(save)
  const [saving, setSaving] = useState(false)
  // Written during render on purpose: the flush below must see the newest `save` and layout, not the ones from an older render.
  saveRef.current = save
  if (!dirty.current) latest.current = prefs

  // A change waiting for its write counts as "saving" in the app's save indicator, which also warns before the tab is closed.
  const hold = useCallback(() => {
    if (!release.current) tracked(() => new Promise((resolve) => (release.current = resolve)))
  }, [])
  const free = useCallback(() => {
    release.current?.()
    release.current = null
  }, [])

  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    if (!dirty.current) return free()
    const next = latest.current
    dirty.current = false
    setSaving(true)
    try {
      await saveRef.current({ dashboard_widgets: next })
    } catch (e) {
      toast.error(`Couldn't save your layout: ${toAppError(e).message}`)
      if (!dirty.current) setDraft(null)
    } finally {
      setSaving(false)
      // Once the account holds this layout the draft is redundant (unless the user has already changed it again).
      if (!dirty.current) {
        setDraft(null)
        free()
      }
    }
  }, [free])

  const change = useCallback(
    (fn, { now = false } = {}) => {
      const next = fn(latest.current)
      if (next === latest.current) return
      latest.current = next
      dirty.current = true
      hold()
      setDraft(next)
      clearTimeout(timer.current)
      if (now) flush()
      else timer.current = setTimeout(flush, SAVE_DELAY_MS)
    },
    [flush, hold],
  )

  // Leaving the page, or hiding the tab, must not lose a change that is still waiting its turn.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [flush])

  return {
    prefs,
    saving,
    setVisible: useCallback((key, on) => change((p) => withVisibility(p, key, on)), [change]),
    setSize: useCallback((key, size) => change((p) => withSize(p, key, size)), [change]),
    setOrder: useCallback((order) => change((p) => withOrder(p, order)), [change]),
    /** Back to the default layout, saved straight away. Returns the layout it replaced so the caller can offer Undo. */
    reset: useCallback(() => {
      const before = latest.current
      change(() => ({}), { now: true })
      return before
    }, [change]),
    /** Put a layout back (Undo after a reset). */
    restore: useCallback((layout) => change(() => layout ?? {}, { now: true }), [change]),
  }
}
