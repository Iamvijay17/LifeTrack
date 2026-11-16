import { useCallback, useRef, useState } from 'react'

const KEY = 'lifetrack:lifemap-view'
export const MIN_K = 0.2
export const MAX_K = 2.5
const clampK = (k) => Math.min(MAX_K, Math.max(MIN_K, k))

const load = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY))
    if (v && [v.k, v.x, v.y].every(Number.isFinite)) return { k: clampK(v.k), x: v.x, y: v.y }
  } catch {
    /* a first visit, or storage is blocked */
  }
  return null
}

/** Pan and zoom of the canvas: screen = world × k + (x, y). Remembered on this device so the map opens where you left it. */
export function useViewport() {
  const [view, setViewState] = useState(load)
  const timer = useRef(null)
  const setView = useCallback((next) => {
    setViewState((prev) => {
      const v = typeof next === 'function' ? next(prev ?? { k: 1, x: 0, y: 0 }) : next
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        try {
          localStorage.setItem(KEY, JSON.stringify(v))
        } catch {
          /* fine without storage */
        }
      }, 300)
      return v
    })
  }, [])

  /** Zoom by a factor around a screen point (relative to the canvas), keeping the world point under it still. */
  const zoomAt = useCallback(
    (factor, cx, cy) =>
      setView((v) => {
        const k = clampK(v.k * factor)
        const f = k / v.k
        return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f }
      }),
    [setView],
  )

  /** Centre and scale to show a world-space box, with some breathing room. */
  const fit = useCallback(
    (box, size, pad = 56) => {
      if (!size.w || !size.h) return
      const k = clampK(Math.min((size.w - pad * 2) / box.w, (size.h - pad * 2) / box.h, 1.1))
      setView({ k, x: size.w / 2 - (box.x + box.w / 2) * k, y: size.h / 2 - (box.y + box.h / 2) * k })
    },
    [setView],
  )

  /** Bring a world point to the middle of the canvas without changing the zoom (unless it is too small to read). */
  const centerOn = useCallback(
    (wx, wy, size) =>
      setView((v) => {
        const k = Math.max(v.k, 0.8)
        return { k, x: size.w / 2 - wx * k, y: size.h / 2 - wy * k }
      }),
    [setView],
  )

  return { view, setView, zoomAt, fit, centerOn }
}
