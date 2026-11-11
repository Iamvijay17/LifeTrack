import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { ListChecks, X } from 'lucide-react'
import { useContextMenu } from './ContextMenuProvider'

/**
 * Floats at the bottom while something is selected: how many, an Actions button that opens the same bulk menu as a right-click,
 * and Clear. `build` returns the bulk items for the current selection.
 */
export function SelectionBar({ selection, noun = 'item', build }) {
  const menu = useContextMenu()
  const btn = useRef(null)
  if (selection.size === 0) return null
  const openActions = () => {
    const r = btn.current.getBoundingClientRect()
    menu.open({ x: r.left, y: r.top - 8, items: build(), label: `Actions for ${selection.size} ${noun}s` })
  }
  return createPortal(
    <div
      role="region"
      aria-label="Selection"
      className="lt-ctx fixed inset-x-0 bottom-20 z-40 mx-auto flex w-fit max-w-[calc(100vw-1.5rem)] animate-ctx-in items-center gap-1 rounded-lg p-1.5 text-[13px] md:bottom-6"
    >
      <span aria-live="polite" className="px-2.5 font-medium">
        {selection.size} {noun}
        {selection.size === 1 ? '' : 's'} selected
      </span>
      <button
        ref={btn}
        type="button"
        onClick={openActions}
        className="lt-press flex items-center gap-1.5 rounded-[8px] bg-primary-solid px-3 py-1.5 font-medium text-white transition-colors hover:opacity-90"
      >
        <ListChecks className="h-3.5 w-3.5" aria-hidden />
        Actions
      </button>
      <button
        type="button"
        onClick={selection.clear}
        aria-label="Clear selection"
        className="lt-press grid h-8 w-8 place-items-center rounded-[8px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>,
    document.body,
  )
}
