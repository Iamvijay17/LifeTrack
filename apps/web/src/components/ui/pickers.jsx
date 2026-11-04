import { Children, Fragment, forwardRef, isValidElement, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { fmtDay } from '@lifetrack/utils'
import { cn } from '@/lib/utils'
import { useSettings } from '@/hooks/useSettings'

// Our own Select / date / time pickers: no native <select> or <input type="date"> popups.
// They keep the contract of the inputs they replace so react-hook-form's register() and plain value/onChange keep working:
// a hidden <input> carries the value (RHF reads and writes `.value` on it) and onChange receives { target }.

const trigger =
  'flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 text-left text-sm transition-colors hover:border-muted-foreground/40 focus-visible:border-primary disabled:opacity-60 aria-[invalid=true]:border-danger h-10 md:h-9'
const popup = 'absolute left-0 z-50 mt-1 rounded-lg border border-border bg-card p-1 shadow-xl animate-fade-in'

/** Shared value plumbing for the three pickers. */
function useFormValue({ forwardedRef, name, value, defaultValue, onChange, onBlur }) {
  const controlled = value !== undefined
  const [inner, setInner] = useState(String(defaultValue ?? ''))
  const innerRef = useRef(inner)
  const elRef = useRef(null)
  const btnRef = useRef(null)
  const current = controlled ? String(value ?? '') : inner
  if (controlled) innerRef.current = current // the hidden input mirrors the controlled value

  const setRef = useCallback(
    (el) => {
      elRef.current = el
      if (el) {
        Object.defineProperty(el, 'value', {
          configurable: true,
          get: () => innerRef.current,
          set: (v) => {
            innerRef.current = String(v ?? '')
            setInner(innerRef.current)
          },
        })
        el.focus = () => btnRef.current?.focus()
      }
      if (typeof forwardedRef === 'function') forwardedRef(el)
      else if (forwardedRef) forwardedRef.current = el
    },
    [forwardedRef],
  )
  const commit = (v) => {
    innerRef.current = v
    setInner(v)
    onChange?.({ type: 'change', target: controlled ? { name, value: v } : elRef.current })
  }
  const blur = () => onBlur?.({ type: 'blur', target: controlled ? { name, value: current } : elRef.current })
  const hidden = <input ref={setRef} name={name} hidden readOnly tabIndex={-1} aria-hidden="true" />
  return { current, commit, blur, hidden, btnRef }
}

/** Close on outside press / Escape-less focus loss; returns [open, setOpen, wrapRef]. */
function usePopup() {
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const away = (e) => !wrap.current?.contains(e.target) && setOpen(false)
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])
  return [open, setOpen, wrap]
}

/** Open upwards when there is not enough room below the trigger. */
function useFlip(open, wrap, height) {
  const [up, setUp] = useState(false)
  useEffect(() => {
    if (!open || !wrap.current) return
    const r = wrap.current.getBoundingClientRect()
    setUp(window.innerHeight - r.bottom < height && r.top > window.innerHeight - r.bottom)
  }, [open, wrap, height])
  return up
}

const textOf = (node) =>
  Children.toArray(node)
    .filter((c) => typeof c === 'string' || typeof c === 'number')
    .join('')
function readOptions(children, out = []) {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return
    if (c.type === Fragment || c.type === 'optgroup') readOptions(c.props.children, out)
    else if (c.type === 'option')
      out.push({ value: String(c.props.value ?? textOf(c.props.children)), label: textOf(c.props.children), disabled: !!c.props.disabled })
  })
  return out
}

export const Select = forwardRef(function Select(
  { className, children, name, value, defaultValue, onChange, onBlur, disabled, id, ...aria },
  forwardedRef,
) {
  const { current, commit, blur, hidden, btnRef } = useFormValue({ forwardedRef, name, value, defaultValue, onChange, onBlur })
  const [open, setOpen, wrap] = usePopup()
  const options = readOptions(children)
  const up = useFlip(open, wrap, 260)
  const [hi, setHi] = useState(0)
  const listRef = useRef(null)
  const selected = options.find((o) => o.value === current) ?? options[0]
  const openList = () => {
    setHi(
      Math.max(
        0,
        options.findIndex((o) => o.value === current),
      ),
    )
    setOpen(true)
  }
  useEffect(() => {
    if (open) listRef.current?.querySelector('[data-hi="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, hi])
  const pick = (o) => {
    if (o.disabled) return
    commit(o.value)
    setOpen(false)
    btnRef.current?.focus()
  }
  const onKey = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return openList()
      setHi((i) => Math.min(options.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1))))
    } else if ((e.key === 'Enter' || e.key === ' ') && open) {
      e.preventDefault()
      if (options[hi]) pick(options[hi])
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation()
      setOpen(false)
    }
  }
  return (
    <div ref={wrap} className="relative">
      {hidden}
      <button
        ref={btnRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKey}
        onBlur={blur}
        className={cn(trigger, className)}
        {...aria}
      >
        <span className="truncate">{selected?.label ?? ''}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          className={cn(popup, 'max-h-60 min-w-full overflow-y-auto', up ? 'bottom-full mb-1 mt-0' : 'top-full')}
        >
          {options.map((o, i) => (
            <li
              key={o.value + i}
              role="option"
              aria-selected={o.value === current}
              data-value={o.value}
              aria-disabled={o.disabled || undefined}
              data-hi={i === hi}
              onPointerEnter={() => setHi(i)}
              onClick={() => pick(o)}
              className={cn(
                'cursor-pointer whitespace-nowrap rounded-md px-3 py-2 text-sm md:py-1.5',
                i === hi && 'bg-muted',
                o.value === current && 'font-semibold text-primary',
                o.disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})

/** The user's "week starts on" setting (Monday when settings are not available, e.g. outside the app shell). */
function useWeekStart() {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return Number(useSettings().settings.week_starts_on) === 0 ? 0 : 1
  } catch {
    return 1
  }
}

const pad = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '')
const todayIso = () => {
  const t = new Date()
  return iso(t.getFullYear(), t.getMonth(), t.getDate())
}
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export const DatePicker = forwardRef(function DatePicker(
  { className, name, value, defaultValue, onChange, onBlur, disabled, id, min, max, placeholder = 'Select date', ...aria },
  forwardedRef,
) {
  const { current, commit, blur, hidden, btnRef } = useFormValue({ forwardedRef, name, value, defaultValue, onChange, onBlur })
  const weekStart = useWeekStart()
  const [open, setOpen, wrap] = usePopup()
  const up = useFlip(open, wrap, 380)
  const seed = isDay(current) ? current : todayIso()
  const [view, setView] = useState({ y: +seed.slice(0, 4), m: +seed.slice(5, 7) - 1 })
  const toggle = () => {
    if (!open) setView({ y: +seed.slice(0, 4), m: +seed.slice(5, 7) - 1 })
    setOpen(!open)
  }
  const shift = (dm) =>
    setView((v) => {
      const d = new Date(v.y, v.m + dm, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  const lead = (new Date(view.y, view.m, 1).getDay() - weekStart + 7) % 7
  const days = new Date(view.y, view.m + 1, 0).getDate()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const today = todayIso()
  const out = (d) => (min && d < min) || (max && d > max)
  const pick = (d) => {
    if (out(d)) return
    commit(d)
    setOpen(false)
    btnRef.current?.focus()
  }
  const nav = 'rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground'
  return (
    <div ref={wrap} className="relative">
      {hidden}
      <button
        ref={btnRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
        onBlur={blur}
        className={cn(trigger, className)}
        {...aria}
      >
        <span className={cn('truncate', !isDay(current) && 'text-muted-foreground/70')}>
          {isDay(current) ? fmtDay(current, 'd MMM yyyy') : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div role="dialog" aria-label="Choose date" className={cn(popup, 'w-72 p-3', up ? 'bottom-full mb-1 mt-0' : 'top-full')}>
          <div className="mb-2 flex items-center justify-between gap-1">
            <button type="button" aria-label="Previous year" className={nav} onClick={() => shift(-12)}>
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Previous month" className={nav} onClick={() => shift(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span aria-live="polite" className="flex-1 text-center text-sm font-semibold">
              {fmtDay(iso(view.y, view.m, 1), 'MMMM yyyy')}
            </span>
            <button type="button" aria-label="Next month" className={nav} onClick={() => shift(1)}>
              <ChevronRight className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Next year" className={nav} onClick={() => shift(12)}>
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} className="py-1">
                {WEEKDAYS[(i + weekStart) % 7]}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (d == null) return <span key={i} />
              const day = iso(view.y, view.m, d)
              const sel = day === current
              return (
                <button
                  key={i}
                  type="button"
                  disabled={out(day)}
                  aria-label={fmtDay(day, 'EEEE, d MMMM yyyy')}
                  aria-pressed={sel}
                  onClick={() => pick(day)}
                  className={cn(
                    'h-9 rounded-md text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-30',
                    day === today && !sel && 'border border-primary text-primary',
                    sel && 'bg-primary font-semibold text-primary-foreground hover:bg-primary',
                  )}
                >
                  {d}
                </button>
              )
            })}
          </div>
          <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm">
            <button
              type="button"
              className="rounded-md px-2 py-1 text-primary hover:bg-muted disabled:opacity-40"
              disabled={out(today)}
              onClick={() => pick(today)}
            >
              Today
            </button>
            {isDay(current) && (
              <button
                type="button"
                className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted"
                onClick={() => {
                  commit('')
                  setOpen(false)
                  btnRef.current?.focus()
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
})

const HOURS = Array.from({ length: 24 }, (_, i) => pad(i))
const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5))

export const TimePicker = forwardRef(function TimePicker(
  { className, name, value, defaultValue, onChange, onBlur, disabled, id, placeholder = 'Select time', ...aria },
  forwardedRef,
) {
  const { current, commit, blur, hidden, btnRef } = useFormValue({ forwardedRef, name, value, defaultValue, onChange, onBlur })
  const [open, setOpen, wrap] = usePopup()
  const up = useFlip(open, wrap, 260)
  const has = /^\d{2}:\d{2}/.test(current)
  const [h, m] = has ? [current.slice(0, 2), current.slice(3, 5)] : ['09', '00']
  const minutes = MINUTES.includes(m) ? MINUTES : [...MINUTES, m].sort()
  const col = (label, items, now, set) => (
    <div role="listbox" aria-label={label} className="max-h-48 flex-1 overflow-y-auto">
      {items.map((v) => (
        <button
          key={v}
          type="button"
          role="option"
          aria-selected={has && v === now}
          onClick={() => set(v)}
          className={cn(
            'block w-full rounded-md px-3 py-1.5 text-center text-sm hover:bg-muted',
            has && v === now && 'bg-primary font-semibold text-primary-foreground hover:bg-primary',
          )}
        >
          {v}
        </button>
      ))}
    </div>
  )
  return (
    <div ref={wrap} className="relative">
      {hidden}
      <button
        ref={btnRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onBlur={blur}
        className={cn(trigger, className)}
        {...aria}
      >
        <span className={cn(!has && 'text-muted-foreground/70')}>{has ? current.slice(0, 5) : placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div role="dialog" aria-label="Choose time" className={cn(popup, 'w-48 p-2', up ? 'bottom-full mb-1 mt-0' : 'top-full')}>
          <div className="flex gap-1">
            {col('Hour', HOURS, h, (v) => commit(`${v}:${m}`))}
            {col('Minute', minutes, m, (v) => commit(`${h}:${v}`))}
          </div>
          <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm">
            <button type="button" className="rounded-md px-2 py-1 text-primary hover:bg-muted" onClick={() => setOpen(false)}>
              Done
            </button>
            {has && (
              <button
                type="button"
                className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted"
                onClick={() => {
                  commit('')
                  setOpen(false)
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
