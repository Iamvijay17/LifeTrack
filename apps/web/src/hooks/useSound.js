import { useCallback, useSyncExternalStore } from 'react'
import { getPrefs, resetPrefs, setPrefs, subscribePrefs, isFocusActive } from '@/lib/interaction/prefs'
import { EVENTS, PROFILES, activeProfileKey, resolveEvent } from '@/lib/interaction/profiles'
import { sound } from '@/lib/interaction/SoundManager'

/** The sound preferences and the controls for them. Re-renders when they change, here or in another tab. */
export function useSound() {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getPrefs)
  const focusing = useSyncExternalStore(subscribePrefs, isFocusActive, isFocusActive)
  const update = useCallback((patch) => setPrefs(patch), [])
  const profileKey = activeProfileKey(prefs, focusing)

  /** What an event is doing right now: on or off, how loud, and whether the person changed it from the profile's value. */
  const eventState = useCallback((event) => resolveEvent(prefs, event, profileKey), [prefs, profileKey])
  const setEvent = useCallback((event, patch) => setPrefs({ events: { [event]: patch } }), [])
  const resetEvent = useCallback((event) => setPrefs({ events: { [event]: null } }), [])

  /** Plays a sample for the Studio. Call it from a click: that gesture is what unlocks audio. A cue name plays that cue as it is. */
  const preview = useCallback((cue, opts) => {
    sound.unlock()
    return sound.play(cue, { preview: true, ...opts })
  }, [])
  /** Plays an event's sample at its current loudness. */
  const previewEvent = useCallback(
    (event, volume) => {
      sound.unlock()
      return sound.play(EVENTS[event].sample, {
        preview: true,
        profile: profileKey,
        volume: volume ?? resolveEvent(getPrefs(), event, profileKey).volume,
      })
    },
    [profileKey],
  )
  /** Plays a profile's sample the way that profile would, before it is chosen. */
  const previewProfile = useCallback((key) => {
    const p = PROFILES[key]
    if (!p?.sample) return null
    sound.unlock()
    const e = p.events[p.sample]
    return sound.play(EVENTS[p.sample].sample, { preview: true, profile: key, volume: e.volume })
  }, [])

  return {
    prefs,
    update,
    profileKey,
    focusing,
    eventState,
    setEvent,
    resetEvent,
    reset: resetPrefs,
    preview,
    previewEvent,
    previewProfile,
    events: EVENTS,
    profiles: PROFILES,
    play: sound.play.bind(sound),
  }
}
