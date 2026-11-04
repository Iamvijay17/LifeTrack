import { forwardRef, useId, cloneElement, isValidElement } from 'react'
import { cn } from '@/lib/utils'
import { DatePicker, TimePicker } from './pickers'

const field =
  'w-full rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground/70 transition-colors hover:border-muted-foreground/40 focus-visible:border-primary disabled:opacity-60'
export const Input = forwardRef(({ className, type, ...p }, ref) => {
  // Dates and times use our own pickers, never the browser's.
  if (type === 'date') return <DatePicker ref={ref} className={className} {...p} />
  if (type === 'time') return <TimePicker ref={ref} className={className} {...p} />
  return <input ref={ref} type={type} className={cn(field, 'h-10 md:h-9', className)} {...p} />
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
    ? cloneElement(children, { id, 'aria-invalid': !!error || undefined, 'aria-describedby': error ? `${id}-e` : undefined })
    : children
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="block text-[13px] font-medium text-foreground/90">
          {label}
        </label>
      )}
      {control}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-e`} role="alert" className="text-xs text-danger">
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
        className="h-4 w-4 rounded border-border bg-background accent-[rgb(var(--primary))]"
      />
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
      className={cn('relative h-6 w-10 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-muted')}
    >
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}
