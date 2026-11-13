import { Children, Fragment, forwardRef, isValidElement, useCallback, useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { fmtDay } from '@lifetrack/utils'
import { cn } from '@/lib/utils'
import { useSettings } from '@/hooks/useSettings'
import { Popup, usePopup } from './popup'

// Our own Select / date / time pickers: no native <select> or <input type="date"> popups.
// They keep the contract of the inputs they replace so react-hook-form's register() and plain value/onChange keep working:
// a hidden <input> carries the value (RHF reads and writes `.value` on it) and onChange receives { target }.

const trigger = 'lt-field flex items-center justify-between gap-2 text-left h-11 md:h-9'

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

const textOf = (node) =>
  Children.toArray(node)
    .filter((c) => typeof c === 'string' || typeof c === 'number')
    .join('')
function readOptions(children, out = [], group) {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return
    if (c.type === Fragment) readOptions(c.props.children, out, group)
    else if (c.type === 'optgroup') readOptions(c.props.children, out, c.props.label)
    else if (c.type === 'option')
      out.push({
        value: String(c.props.value ?? textOf(c.props.children)),
        label: textOf(c.props.children),
        disabled: !!c.props.disabled,
        group,
      })
  })
  return out
}

export const Select = forwardRef(function Select(
  { className, children, name, value, defaultValue, onChange, onBlur, disabled, id, ...aria },
  forwardedRef,
) {
  const { current, commit, blur, hidden, btnRef } = useFormValue({ forwardedRef, name, value, defaultValue, onChange, onBlur })
  const [open, setOpen, wrap, listRef] = usePopup({ onEscape: () => btnRef.current?.focus() })
  const options = readOptions(children)
  const [hi, setHi] = useState(0)
  const listId = useId()
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
  }, [open, hi, listRef])
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
    } else if (e.key === 'Tab' && open) {
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
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${hi}` : undefined}
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
      <Popup
        open={open}
        anchorRef={wrap}
        popupRef={listRef}
        matchWidth
        id={listId}
        role="listbox"
        aria-label={aria['aria-label']}
        aria-labelledby={aria['aria-label'] ? undefined : id}
      >
        {options.map((o, i) => (
          <Fragment key={o.value + i}>
            {o.group && o.group !== options[i - 1]?.group && (
              <div role="presentation" className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {o.group}
              </div>
            )}
            <div
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === current}
              data-value={o.value}
              aria-disabled={o.disabled || undefined}
              data-hi={i === hi}
              onPointerEnter={() => setHi(i)}
              onClick={() => pick(o)}
              className={cn(
                'cursor-pointer whitespace-nowrap rounded-md px-3 py-2.5 text-sm md:py-1.5',
                i === hi && 'bg-muted',
                o.value === current && 'font-semibold text-mod-text',
                o.disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              {o.label}
            </div>
          </Fragment>
        ))}
      </Popup>
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
  {
    className,
    name,
    value,
    defaultValue,
    onChange,
    onBlur,
    disabled,
    id,
    min,
    max,
    placeholder = 'Select date',
    display,
    clearable = true,
    ...aria
  },
  forwardedRef,
) {
  const { current, commit, blur, hidden, btnRef } = useFormValue({ forwardedRef, name, value, defaultValue, onChange, onBlur })
  const weekStart = useWeekStart()
  const [open, setOpen, wrap, popRef] = usePopup({ onEscape: () => btnRef.current?.focus() })
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
  const nav = 'rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:p-1.5'
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
        <span className={cn('truncate', !isDay(current) && 'text-muted-foreground')}>
          {isDay(current) ? (display ?? fmtDay(current, 'd MMM yyyy')) : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      <Popup open={open} anchorRef={wrap} popupRef={popRef} role="dialog" aria-label="Choose date" className="w-72 p-3">
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
                data-sound="select"
                aria-label={fmtDay(day, 'EEEE, d MMMM yyyy')}
                aria-pressed={sel}
                onClick={() => pick(day)}
                className={cn(
                  'h-9 rounded-md text-sm hover:bg-muted disabled:pointer-events-none disabled:opacity-30',
                  day === today && !sel && 'border border-mod text-mod-text',
                  sel && 'bg-primary-solid font-semibold text-primary-foreground hover:bg-primary-solid',
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
          {clearable && isDay(current) && (
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
      </Popup>
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
  const [open, setOpen, wrap, popRef] = usePopup({ onEscape: () => btnRef.current?.focus() })
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
            has && v === now && 'bg-primary-solid font-semibold text-primary-foreground hover:bg-primary-solid',
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
        <span className={cn(!has && 'text-muted-foreground')}>{has ? current.slice(0, 5) : placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      <Popup open={open} anchorRef={wrap} popupRef={popRef} role="dialog" aria-label="Choose time" className="w-48 p-2">
        <div className="flex gap-1">
          {col('Hour', HOURS, h, (v) => commit(`${v}:${m}`))}
          {col('Minute', minutes, m, (v) => commit(`${h}:${v}`))}
        </div>
        <div className="mt-2 flex justify-between border-t border-border pt-2 text-sm">
          <button type="button" className="rounded-md px-2 py-1 text-mod-text hover:bg-muted" onClick={() => setOpen(false)}>
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
      </Popup>
    </div>
  )
})
