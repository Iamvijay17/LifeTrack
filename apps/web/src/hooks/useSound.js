import { useCallback, useSyncExternalStore } from 'react'
import { CATEGORIES, getPrefs, setPrefs, subscribePrefs } from '@/lib/interaction/prefs'
import { sound } from '@/lib/interaction/SoundManager'

/** The sound preferences and the controls for them. Re-renders when they change, here or in another tab. */
export function useSound() {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getPrefs)
  const update = useCallback((patch) => setPrefs(patch), [])
  const setCategory = useCallback((name, on) => setPrefs({ categories: { [name]: on } }), [])
  /** Plays a sample for the Settings screen. Call it from a click: that gesture is what unlocks audio. */
  const preview = useCallback((cue) => {
    sound.unlock()
    return sound.play(cue, { preview: true })
  }, [])
  return { prefs, update, setCategory, preview, categories: CATEGORIES, play: sound.play.bind(sound) }
}
