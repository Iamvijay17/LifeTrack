import { forwardRef, useId, cloneElement, isValidElement } from 'react'
import { cn } from '@/lib/utils'

const field = 'w-full rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground/70 transition-colors hover:border-muted-foreground/40 focus-visible:border-primary disabled:opacity-60'
export const Input = forwardRef(({ className, ...p }, ref) => <input ref={ref} className={cn(field, 'h-10 md:h-9', className)} {...p} />)
Input.displayName = 'Input'
export const Textarea = forwardRef(({ className, rows = 3, ...p }, ref) => <textarea ref={ref} rows={rows} className={cn(field, 'py-2 resize-y', className)} {...p} />)
Textarea.displayName = 'Textarea'
export const Select = forwardRef(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cn(field, 'h-10 md:h-9 appearance-none bg-no-repeat pr-8 [background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27none%27 stroke=%27%23a1a1aa%27 stroke-width=%272%27%3E%3Cpath d=%27m4 6 4 4 4-4%27/%3E%3C/svg%3E")] [background-position:right_.6rem_center]', className)} {...p}>{children}</select>
))
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
