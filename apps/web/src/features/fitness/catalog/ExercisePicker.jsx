import { forwardRef, useCallback, useId, useMemo, useRef, useState } from 'react'
import { suggestExercises } from '@/domain/exerciseCatalog'
import { Input } from '@/components/ui/form'
import { Popup, usePopup } from '@/components/ui/popup'
import { cn } from '@/lib/utils'
import { ExerciseImage } from './ExerciseImage'
import { useCatalog } from './useCatalog'

/** Writes `value` into an uncontrolled input and tells React (and so react-hook-form) it changed, as if it had been typed. */
function setInputValue(el, value) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * The exercise-name field for workouts and routines: a normal text box (any name can still be typed) with a list of suggestions that
 * each show the exercise's photo next to its name. Your own exercises come first, then matches from the exercise database.
 * Drop-in for `<Input {...register(name)} />`: it forwards the ref, name, onChange and onBlur.
 */
export const ExercisePicker = forwardRef(function ExercisePicker(
  { library, className, onFocus, onBlur, onKeyDown, ...input },
  forwardedRef,
) {
  const { catalog } = useCatalog()
  const el = useRef(null)
  const [query, setQuery] = useState('')
  const [open, setOpen, wrap, listRef] = usePopup({ onEscape: () => el.current?.focus() })
  const [hi, setHi] = useState(-1)
  const listId = useId()
  const items = useMemo(() => suggestExercises({ library, catalog: catalog?.exercises, query }), [library, catalog, query])
  const setRefs = useCallback(
    (node) => {
      el.current = node
      if (typeof forwardedRef === 'function') forwardedRef(node)
      else if (forwardedRef) forwardedRef.current = node
    },
    [forwardedRef],
  )
  const pick = (item) => {
    setInputValue(el.current, item.name)
    setQuery(item.name)
    setOpen(false)
    setHi(-1)
    el.current.focus()
  }
  const show = items.length > 0
  const key = (e) => {
    onKeyDown?.(e)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      setHi((i) => Math.min(items.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1))))
      requestAnimationFrame(() => listRef.current?.querySelector('[data-hi="true"]')?.scrollIntoView({ block: 'nearest' }))
    } else if (e.key === 'Enter' && open && items[hi]) {
      e.preventDefault() // choosing a suggestion, not submitting the form
      pick(items[hi])
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }
  return (
    <div ref={wrap} className="relative min-w-0 flex-1">
      <Input
        {...input}
        ref={setRefs}
        role="combobox"
        aria-expanded={open && show}
        aria-controls={open && show ? listId : undefined}
        aria-activedescendant={open && hi >= 0 ? `${listId}-${hi}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        className={className}
        onFocus={(e) => {
          onFocus?.(e)
          setQuery(e.target.value)
          setOpen(true)
        }}
        onChange={(e) => {
          input.onChange?.(e)
          setQuery(e.target.value)
          setHi(-1)
          setOpen(true)
        }}
        onBlur={(e) => {
          onBlur?.(e)
          // Focus moved on (Tab, or another field): close. Choosing an option keeps focus here (its mousedown is cancelled).
          if (!listRef.current?.contains(e.relatedTarget)) setOpen(false)
        }}
        onKeyDown={key}
      />
      <Popup
        open={open && show}
        anchorRef={wrap}
        popupRef={listRef}
        matchWidth
        id={listId}
        role="listbox"
        aria-label="Exercise suggestions"
        className="max-h-72"
      >
        {items.map((it, i) => (
          <div key={it.key}>
            {it.kind === 'database' && items[i - 1]?.kind !== 'database' && (
              <div role="presentation" className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                From the exercise database
              </div>
            )}
            <div
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === hi}
              data-hi={i === hi}
              onPointerEnter={() => setHi(i)}
              onMouseDown={(e) => e.preventDefault()} // keep focus in the text box
              onClick={() => pick(it)}
              className={cn('flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5', i === hi && 'bg-muted')}
            >
              <span className="w-16 shrink-0">
                <ExerciseImage compact path={it.entry?.images?.[0]} alt="" label="" className="rounded-md" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{it.name}</span>
                {it.detail && <span className="block truncate text-xs text-muted-foreground">{it.detail}</span>}
              </span>
            </div>
          </div>
        ))}
      </Popup>
    </div>
  )
})
