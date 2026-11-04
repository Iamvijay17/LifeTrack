import { forwardRef, useId, cloneElement, isValidElement } from 'react'
import { cn } from '@/lib/utils'
import { DatePicker, TimePicker } from './pickers'

const field = 'lt-field'
export const Input = forwardRef(({ className, type, ...p }, ref) => {
  // Dates and times use our own pickers, never the browser's.
  if (type === 'date') return <DatePicker ref={ref} className={className} {...p} />
  if (type === 'time') return <TimePicker ref={ref} className={className} {...p} />
  return <input ref={ref} type={type} className={cn(field, 'h-11 md:h-9', className)} {...p} />
})
Input.displayName = 'Input'
export const Textarea = forwardRef(({ className, rows = 3, ...p }, ref) => (
  <textarea ref={ref} rows={rows} className={cn(field, 'py-2 resize-y', className)} {...p} />
))
Textarea.displayName = 'Textarea'
export { Select } from './pickers'

/** Label + control + error. The control gets the id / aria wiring automatically. */
export function Field({ label, error, hint, children, className }) {
  const id = useId()
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': !!error || undefined,
        'aria-describedby': error ? `${id}-e` : hint ? `${id}-h` : undefined,
      })
    : children
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="block text-[13px] font-medium text-foreground/90">
          {label}
        </label>
      )}
      {control}
      {hint && !error && (
        <p id={`${id}-h`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-e`} role="alert" className="animate-slide-down text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export function Checkbox({ checked, onChange, label, disabled, className }) {
  return (
    <label className={cn('inline-flex items-center gap-2 text-sm cursor-pointer select-none', disabled && 'opacity-60', className)}>
      <input
        type="checkbox"
        checked={!!checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="peer sr-only"
      />
      <span className="lt-check-box" aria-hidden>
        <svg
          viewBox="0 0 16 16"
          className="h-3 w-3"
          fill="none"
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      </span>
      {label}
    </label>
  )
}

export function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        // The ::before pads the 24px track out to a 44px touch target without changing its size in the layout.
        "relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-['']",
        checked ? 'bg-gradient-to-r from-[#7C3AED] to-[#6366F1] shadow-[0_0_12px_-2px_rgb(var(--primary)/0.7)]' : 'bg-muted-foreground/30',
      )}
    >
      <span
        className={cn(
          'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-[260ms] ease-spring',
          checked && 'translate-x-4',
        )}
      />
    </button>
  )
}
