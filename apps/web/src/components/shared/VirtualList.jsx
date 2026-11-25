import { useEffect, useRef, useState } from 'react'

/**
 * A scrolling list that renders only the rows in view (plus a small margin), for lists too long to put in the page at once. Rows must have a fixed height.
 * `renderRow(item, index)` returns the row's contents. Keyboard and screen readers get a plain list with the full count in aria-setsize.
 */
export function VirtualList({
  items,
  rowHeight = 56,
  height = 420,
  overscan = 6,
  renderRow,
  getKey = (it, i) => it?.id ?? i,
  label,
  className = '',
}) {
  const ref = useRef(null)
  const [top, setTop] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const on = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setTop(el.scrollTop))
    }
    el.addEventListener('scroll', on, { passive: true })
    return () => {
      el.removeEventListener('scroll', on)
      cancelAnimationFrame(raf)
    }
  }, [])
  const total = items.length
  const first = Math.max(0, Math.floor(top / rowHeight) - overscan)
  const last = Math.min(total, Math.ceil((top + height) / rowHeight) + overscan)
  return (
    <div
      ref={ref}
      role="list"
      aria-label={label}
      tabIndex={0}
      className={`overflow-auto ${className}`}
      style={{ height: Math.min(height, Math.max(total * rowHeight, rowHeight)) }}
      data-testid="virtual-list"
    >
      <div style={{ height: total * rowHeight, position: 'relative' }}>
        {items.slice(first, last).map((it, k) => {
          const i = first + k
          return (
            <div
              key={getKey(it, i)}
              role="listitem"
              aria-posinset={i + 1}
              aria-setsize={total}
              style={{ position: 'absolute', top: i * rowHeight, left: 0, right: 0, height: rowHeight }}
            >
              {renderRow(it, i)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
