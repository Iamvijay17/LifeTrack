import { useEffect, useRef } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popup, usePopup } from './popup'

/** Accessible popup menu: arrow keys, Home/End, Escape returns focus to the trigger. items: [{label, icon, onClick, danger, hidden}] */
export function Menu({ items, label = 'Actions', trigger, align = 'right', className }) {
  const button = useRef(null)
  const [open, setOpen, anchorRef, popupRef] = usePopup({ onEscape: () => button.current?.focus() })
  const visible = items.filter((i) => !i.hidden)

  useEffect(() => {
    if (open) popupRef.current?.querySelector('[role=menuitem]')?.focus({ preventScroll: true })
  }, [open, popupRef])

  const onKeyDown = (e) => {
    const all = [...popupRef.current.querySelectorAll('[role=menuitem]')]
    const at = all.indexOf(document.activeElement)
    const go = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: all.length - 1 }[e.key]
    if (go !== undefined) {
      e.preventDefault()
      all[(go + all.length) % all.length]?.focus()
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={anchorRef} className={cn('relative inline-block', className)}>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className={
          trigger
            ? 'block rounded-md'
            : 'lt-press grid h-10 w-10 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:h-7 md:w-7'
        }
      >
        {trigger ?? <MoreHorizontal className="h-4 w-4" />}
      </button>
      <Popup
        open={open}
        anchorRef={anchorRef}
        popupRef={popupRef}
        align={align}
        role="menu"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="min-w-40"
      >
        {visible.map((i) => (
          <button
            key={i.label}
            role="menuitem"
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
              i.onClick()
            }}
            className={cn(
              'flex w-full items-center gap-2 whitespace-nowrap rounded-sm px-2.5 py-2.5 text-left text-[13px] transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-0 focus-visible:ring-offset-0 md:py-1.5',
              i.danger && 'text-danger',
            )}
          >
            {i.icon && <i.icon className="h-3.5 w-3.5" aria-hidden />}
            {i.label}
          </button>
        ))}
      </Popup>
    </div>
  )
}
