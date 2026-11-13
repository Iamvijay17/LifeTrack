import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import { useSonner } from 'sonner'
import { ARRIVAL_CLASS, actionSucceeded, trackPress } from '@/lib/interaction/feedback'
import { haptic } from '@/lib/interaction/haptics'
import { cueForTarget, isStateful } from '@/lib/interaction/rules'
import { sound } from '@/lib/interaction/SoundManager'

const Ctx = createContext(null)

/** Toast type -> cue. Plain and info toasts are the app talking to you, so they get the gentle notification chime. */
const TOAST_CUE = { success: 'success', error: 'error', warning: 'warning', info: 'notify', default: 'notify', message: 'notify' }

/**
 * Every toast in the app (about forty call sites) is a moment of feedback, so one watcher here gives all of them their sound instead of
 * each call site remembering to. Toasts already on screen when this mounts are not announced.
 */
function ToastSounds() {
  const { toasts } = useSonner()
  const seen = useRef(null)
  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(toasts.map((t) => t.id))
      return
    }
    for (const t of toasts) {
      if (seen.current.has(t.id)) continue
      seen.current.add(t.id)
      if (t.dismiss) continue
      const cue = t.className?.includes(ARRIVAL_CLASS) ? 'notify' : TOAST_CUE[t.type ?? 'default']
      if (cue) sound.play(cue)
    }
    if (seen.current.size > 200) seen.current = new Set(toasts.map((t) => t.id)) // never grow for ever
  }, [toasts])
  return null
}

/**
 * Mounted once at the top of the app. Owns the page-wide listeners, so no component has to wire its own:
 *  - unlocks audio on the first real gesture (browsers keep it locked until then),
 *  - gives every button, link, tab, switch, checkbox and menu item its click/toggle/navigation cue from one delegated listener,
 *  - remembers which button was pressed, so a successful action can make that button glow,
 *  - sounds the toasts.
 * Components that know something more specific (a task completed, a timer started) call `useInteraction().play(...)`; a specific cue in the
 * same click silences the generic one, so you never hear both.
 */
export function InteractionProvider({ children }) {
  useEffect(() => {
    const unlock = () => {
      if (sound.unlock()) {
        for (const e of UNLOCK_EVENTS) document.removeEventListener(e, unlock, true)
      }
    }
    for (const e of UNLOCK_EVENTS) document.addEventListener(e, unlock, true)

    let mark = 0
    const before = (e) => {
      mark = sound.requests
      const btn = e.target instanceof Element ? e.target.closest('button, [role=button], a[href]') : null
      if (btn) trackPress(btn)
    }
    // Bubble phase on the document runs after React's own handlers (React listens at the root), so any specific cue they asked for is already counted.
    const after = (e) => {
      if (sound.requests !== mark) return
      const target = e.target
      const play = () => {
        const cue = cueForTarget(target)
        if (cue) sound.play(cue, { generic: true })
      }
      // A switch's cue depends on the state the click produced, and React has not necessarily rendered it yet: look one tick later (a few ms, inaudible).
      if (isStateful(target)) setTimeout(play, 0)
      else play()
    }
    document.addEventListener('click', before, true)
    document.addEventListener('click', after)
    return () => {
      for (const e of UNLOCK_EVENTS) document.removeEventListener(e, unlock, true)
      document.removeEventListener('click', before, true)
      document.removeEventListener('click', after)
    }
  }, [])

  const api = useMemo(() => ({ play: sound.play.bind(sound), haptic, success: actionSucceeded }), [])
  return (
    <Ctx.Provider value={api}>
      <ToastSounds />
      {children}
    </Ctx.Provider>
  )
}

const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend']

const FALLBACK = { play: sound.play.bind(sound), haptic, success: actionSucceeded }

/** `const { play, haptic, success } = useInteraction()`. Works without the provider too (the engine is a module singleton), which keeps isolated component tests simple. */
export const useInteraction = () => useContext(Ctx) ?? FALLBACK
