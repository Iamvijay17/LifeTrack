import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

const GAP = 4
const EDGE = 8

/** Marks an open popup so a parent dialog can leave Escape to it instead of closing itself (see ui/dialog.jsx). */
export const POPUP_ATTR = 'data-lt-popup'
export const hasOpenPopup = (root = document) => !!root.querySelector(`[${POPUP_ATTR}]`)

/** The [open, setOpen, anchorRef, popupRef] state of a popup: closes on a press outside both the anchor and the popup, and on Escape. */
export function usePopup({ onEscape } = {}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef(null)
  const popupRef = useRef(null)
  const escape = useRef(onEscape)
  escape.current = onEscape
  useEffect(() => {
    if (!open) return undefined
    const away = (e) => {
      if (!anchorRef.current?.contains(e.target) && !popupRef.current?.contains(e.target)) setOpen(false)
    }
    const key = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
      escape.current?.()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  return [open, setOpen, anchorRef, popupRef]
}

/**
 * Where a popup goes, given the anchor and popup sizes in viewport coordinates: below the anchor when it fits, otherwise above when
 * there is more room there; always kept on screen horizontally. Pure, so it can be unit-tested.
 */
export function placePopup({ anchor, popup, viewport, align = 'left' }) {
  const spaceBelow = viewport.height - anchor.bottom - GAP - EDGE
  const spaceAbove = anchor.top - GAP - EDGE
  const above = popup.height > spaceBelow && spaceAbove > spaceBelow
  const maxHeight = Math.max(120, above ? spaceAbove : spaceBelow)
  const height = Math.min(popup.height, maxHeight)
  const wanted = align === 'right' ? anchor.right - popup.width : anchor.left
  const left = Math.max(EDGE, Math.min(wanted, viewport.width - popup.width - EDGE))
  return { top: above ? anchor.top - GAP - height : anchor.bottom + GAP, left, maxHeight, above }
}

/**
 * A popup anchored to an element, drawn in a portal so scroll areas and `overflow-hidden` cards can't clip it. Inside a modal dialog it
 * portals into the dialog, which keeps it within the dialog's focus trap and pointer-events (and keeps a click in it from closing the dialog).
 */
export function Popup({ open, anchorRef, popupRef, align = 'left', matchWidth = false, className, children, ...props }) {
  const [style, setStyle] = useState(null)
  const local = useRef(null)
  const container = useRef(null)
  const setRefs = useCallback(
    (el) => {
      local.current = el
      if (popupRef) popupRef.current = el
    },
    [popupRef],
  )

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null)
      return undefined
    }
    const measure = () => {
      const a = anchorRef.current
      const p = local.current
      if (!a || !p) return
      const anchor = a.getBoundingClientRect()
      const width = matchWidth ? Math.max(anchor.width, p.offsetWidth) : p.offsetWidth
      const spot = placePopup({
        anchor,
        popup: { width, height: p.scrollHeight + 2 },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        align,
      })
      // The dialog is `position: fixed`, so it is the containing block for `absolute` children whether or not it has a transform.
      const box = container.current === document.body ? null : container.current?.getBoundingClientRect()
      setStyle({
        position: box ? 'absolute' : 'fixed',
        top: spot.top - (box ? box.top + container.current.clientTop : 0),
        left: spot.left - (box ? box.left + container.current.clientLeft : 0),
        maxHeight: spot.maxHeight,
        minWidth: matchWidth ? anchor.width : undefined,
      })
    }
    measure()
    const onScroll = (e) => {
      if (!local.current?.contains(e.target)) measure() // scrolling the popup's own list doesn't move the anchor
    }
    window.addEventListener('resize', measure)
    document.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', measure)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [open, anchorRef, align, matchWidth])

  if (!open) return null
  if (!container.current?.isConnected) container.current = anchorRef.current?.closest('[role="dialog"]') ?? document.body
  return createPortal(
    <div
      ref={setRefs}
      {...{ [POPUP_ATTR]: '' }}
      // Not yet measured: hidden with opacity, not visibility, because a menu moves focus into itself as soon as it mounts.
      style={style ?? { position: 'fixed', top: 0, left: 0, opacity: 0 }}
      className={cn(
        'z-[60] max-w-[calc(100vw-1rem)] origin-top animate-pop-in overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-overlay',
        className,
      )}
      {...props}
    >
      {children}
    </div>,
    container.current ?? document.body,
  )
}
