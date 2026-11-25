import { useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, ease, m } from '@/components/motion/primitives'

const GAP = 10

/** A label beside its target on mouse hover or keyboard focus. Portalled so scroll areas can't clip it. `side`: 'right' or 'bottom'. */
export function Tooltip({ label, side = 'right', disabled, className, children }) {
  const [box, setBox] = useState(null)
  const show = (e) => {
    if (!disabled && e.pointerType !== 'touch') setBox(e.currentTarget.getBoundingClientRect())
  }
  const hide = () => setBox(null)
  const place =
    box &&
    (side === 'right'
      ? { left: box.right + GAP, top: box.top + box.height / 2, translateY: '-50%' }
      : { left: box.left + box.width / 2, top: box.bottom + GAP, translateX: '-50%' })
  return (
    <div className={className} onPointerEnter={show} onPointerLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {createPortal(
        <AnimatePresence>
          {box && !disabled && (
            <m.div
              role="tooltip"
              initial={{ opacity: 0, x: side === 'right' ? -4 : 0, y: side === 'bottom' ? -4 : 0 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
              transition={{ duration: 0.14, ease: ease.out }}
              style={{
                position: 'fixed',
                left: place?.left,
                top: place?.top,
                translate: `${place?.translateX ?? 0} ${place?.translateY ?? 0}`,
              }}
              className="pointer-events-none z-[70] whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-xs font-medium shadow-overlay"
            >
              {label}
            </m.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}
