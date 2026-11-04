import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
export const Card = ({ className, ...p }) => <div className={cn('rounded-lg border border-border bg-card', className)} {...p} />
export const CardHeader = ({ className, ...p }) => (
  <div className={cn('flex items-center justify-between gap-2 px-4 pt-4', className)} {...p} />
)
export const CardTitle = ({ className, as: Tag = 'h2', ...p }) => (
  <Tag className={cn('text-sm font-medium text-foreground', className)} {...p} />
)
export const CardContent = ({ className, ...p }) => <div className={cn('p-4', className)} {...p} />

/** The small "go to this module" link in a card header. Padding gives it a usable touch target without making the header taller. */
export const CardLink = ({ className, ...p }) => (
  <Link className={cn('-my-2 -mr-2 rounded-md p-2 text-xs text-secondary underline underline-offset-2', className)} {...p} />
)
