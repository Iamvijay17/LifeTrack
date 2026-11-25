import { useEffect, useRef } from 'react'
import { sound } from '@/lib/interaction/SoundManager'

export { useInteraction } from '@/components/interaction/InteractionProvider'

/** Plays `openCue` when `open` turns true and `closeCue` when it turns false. Not on the first render, so a panel that starts open is silent. */
export function useOpenSound(open, openCue = 'open', closeCue = 'close') {
  const prev = useRef(open)
  useEffect(() => {
    if (prev.current === open) return
    prev.current = open
    sound.play(open ? openCue : closeCue)
  }, [open, openCue, closeCue])
}
