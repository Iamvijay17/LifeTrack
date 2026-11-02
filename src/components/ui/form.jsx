import { forwardRef, useId, cloneElement, isValidElement, useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const field = 'w-full rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground/70 transition-colors hover:border-muted-foreground/40 focus-visible:border-primary disabled:opacity-60'
export const Input = forwardRef(({ className, ...p }, ref) => <input ref={ref} className={cn(field, 'h-10 md:h-9', className)} {...p} />)
Input.displayName = 'Input'
export const Textarea = forwardRef(({ className, rows = 3, ...p }, ref) => <textarea ref={ref} rows={rows} className={cn(field, 'py-2 resize-y', className)} {...p} />)
Textarea.displayName = 'Textarea'
/**
 * Themed dropdown. API-compatible with a native <select> (children are <option>/<optgroup>, `register`, `value`/`onChange`),
 * because the real value lives in a visually hidden native <select>; the button + list are only the presentation.
 */
export const Select = forwardRef(({ className, children, id, disabled, 'aria-invalid': invalid, 'aria-describedby': describedBy, 'aria-label': ariaLabel, ...p }, ref) => {
  const selRef = useRef(null)
  const btnRef = useRef(null)
  const listRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [pos, setPos] = useState(null)
  const [items, setItems] = useState([])
  const [label, setLabel] = useState('')
  const [value, setValue] = useState('')
  const listId = useId()

  const readSelection = useCallback(() => {
    const el = selRef.current
    if (!el) return
    const o = el.selectedOptions?.[0]
    setLabel(o ? o.text : '')
    setValue(el.value)
  }, [])

  // Hook the element so programmatic writes (react-hook-form setValue/reset) refresh the label; redirect focus() to the button.
  const setRefs = useCallback((el) => {
    selRef.current = el
    if (typeof ref === 'function') ref(el); else if (ref) ref.current = el
    if (el && !el.__themed) {
      el.__themed = true
      const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')
      Object.defineProperty(el, 'value', { configurable: true, get() { return d.get.call(this) }, set(v) { d.set.call(this, v); readSelection() } })
      el.focus = (o) => btnRef.current?.focus(o)
    }
  }, [ref, readSelection])

  useLayoutEffect(() => { readSelection() })

  const collect = () => {
    const out = []
    for (const n of selRef.current?.children ?? []) {
      if (n.tagName === 'OPTGROUP') { out.push({ group: n.label }); for (const o of n.children) out.push({ value: o.value, label: o.text, disabled: o.disabled || n.disabled }) }
      else if (n.tagName === 'OPTION') out.push({ value: n.value, label: n.text, disabled: n.disabled })
    }
    return out
  }

  const place = () => {
    const btn = btnRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    const flip = below < 200 && above > below
    const maxHeight = Math.max(120, Math.min(320, flip ? above : below))
    const host = btn.closest('[role="dialog"]')
    if (host) {
      const h = host.getBoundingClientRect()
      const left = r.left - h.left - host.clientLeft
      const base = flip ? { bottom: h.bottom - r.top + 4 - (h.height - host.clientHeight - host.clientTop) } : { top: r.bottom - h.top - host.clientTop + 4 }
      setPos({ host, style: { position: 'absolute', left, minWidth: r.width, maxHeight, ...base } })
    } else {
      setPos({ host: document.body, style: { position: 'fixed', left: r.left, minWidth: r.width, maxHeight, ...(flip ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) } })
    }
  }

  const show = () => {
    if (disabled) return
    const list = collect()
    setItems(list)
    setActive(Math.max(0, list.findIndex((i) => !i.group && i.value === selRef.current.value)))
    place()
    setOpen(true)
  }
  const hide = (refocus = true) => { setOpen(false); if (refocus) btnRef.current?.focus() }

  const choose = (item) => {
    if (!item || item.group || item.disabled) return
    const el = selRef.current
    if (el.value !== item.value) {
      el.value = item.value
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    hide()
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!listRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); hide() } }
    const onResize = () => setOpen(false)
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onResize)
    return () => { document.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize) }
  }, [open])

  useEffect(() => { if (open) listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' }) }, [open, active])

  const move = (dir, from = active) => {
    let i = from
    for (let n = 0; n < items.length; n++) { i = (i + dir + items.length) % items.length; if (!items[i].group && !items[i].disabled) return setActive(i) }
  }
  const onKeyDown = (e) => {
    if (!open) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show() } return }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Home') { e.preventDefault(); move(1, -1) }
    else if (e.key === 'End') { e.preventDefault(); move(-1, 0) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(items[active]) }
    else if (e.key === 'Tab') setOpen(false)
    else if (e.key.length === 1) {
      const q = e.key.toLowerCase()
      const i = items.findIndex((it, idx) => idx > active && !it.group && !it.disabled && it.label.toLowerCase().startsWith(q))
      const j = i >= 0 ? i : items.findIndex((it) => !it.group && !it.disabled && it.label.toLowerCase().startsWith(q))
      if (j >= 0) setActive(j)
    }
  }

  const list = open && pos && createPortal(
    <ul ref={listRef} id={listId} role="listbox" style={pos.style}
      className="z-[60] overflow-y-auto rounded-md border border-border bg-card p-1 text-sm shadow-xl animate-fade-in">
      {items.map((it, i) => it.group
        ? <li key={`g${i}`} role="presentation" className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{it.group}</li>
        : <li key={`${i}-${it.value}`} id={`${listId}-${i}`} role="option" aria-selected={it.value === value} aria-disabled={it.disabled || undefined} data-active={i === active}
            onPointerEnter={() => !it.disabled && setActive(i)} onPointerDown={(e) => e.preventDefault()} onClick={() => choose(it)}
            className={cn('flex cursor-pointer items-center gap-2 rounded px-2 py-1.5', i === active && 'bg-muted', it.value === value && 'font-medium text-primary', it.disabled && 'cursor-not-allowed opacity-50')}>
            <Check className={cn('h-3.5 w-3.5 shrink-0', it.value === value ? 'opacity-100' : 'opacity-0')} />
            <span className="truncate">{it.label || ' '}</span>
          </li>)}
    </ul>, pos.host)

  return (
    <div className={cn('relative w-full', className)}>
      <select ref={setRefs} tabIndex={-1} aria-hidden="true" disabled={disabled} className="pointer-events-none absolute inset-0 h-full w-full opacity-0" {...p}>{children}</select>
      <button ref={btnRef} type="button" id={id} disabled={disabled} role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined} aria-label={ariaLabel} aria-invalid={invalid} aria-describedby={describedBy}
        onClick={() => (open ? hide(false) : show())} onKeyDown={onKeyDown} onBlur={(e) => p.onBlur?.({ target: selRef.current, currentTarget: selRef.current, type: 'blur' })}
        className={cn(field, 'flex h-10 items-center justify-between gap-2 text-left md:h-9', open && 'border-primary', invalid && 'border-danger')}>
        <span className="truncate">{label || ' '}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {list}
    </div>
  )
})
Select.displayName = 'Select'

/** Label + control + error. The control gets the id / aria wiring automatically. */
export function Field({ label, error, hint, children, className }) {
  const id = useId()
  const control = isValidElement(children) ? cloneElement(children, { id, 'aria-invalid': !!error || undefined, 'aria-describedby': error ? `${id}-e` : undefined }) : children
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <label htmlFor={id} className="block text-[13px] font-medium text-foreground/90">{label}</label>}
      {control}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-e`} role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  )
}

export function Checkbox({ checked, onChange, label, disabled, className }) {
  return (
    <label className={cn('inline-flex items-center gap-2 text-sm cursor-pointer select-none', disabled && 'opacity-60', className)}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)}
        className="h-4 w-4 rounded border-border bg-background accent-[rgb(var(--primary))]" />
      {label}
    </label>
  )
}

export function Switch({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-10 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-muted')}>
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}
