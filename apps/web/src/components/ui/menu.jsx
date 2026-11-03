import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Small accessible-enough popup menu: Escape / outside-click to close. items: [{label, icon, onClick, danger, hidden}] */
export function Menu({ items, label = 'Actions', trigger, align = 'right', className }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const off = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', off)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', off)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div ref={ref} className={cn('relative inline-block', className)}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className={trigger ? '' : 'rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground'}
      >
        {trigger ?? <MoreHorizontal className="h-4 w-4" />}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-40 mt-1 min-w-40 rounded-md border border-border bg-card p-1 shadow-xl animate-fade-in',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items
            .filter((i) => !i.hidden)
            .map((i) => (
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
                  'flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[13px] hover:bg-muted',
                  i.danger && 'text-danger',
                )}
              >
                {i.icon && <i.icon className="h-3.5 w-3.5" />}
                {i.label}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
