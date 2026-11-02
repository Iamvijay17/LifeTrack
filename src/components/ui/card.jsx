import { cn } from '@/lib/utils'
export const Card = ({ className, ...p }) => <div className={cn('rounded-lg border border-border bg-card', className)} {...p} />
export const CardHeader = ({ className, ...p }) => <div className={cn('flex items-center justify-between gap-2 px-4 pt-4', className)} {...p} />
export const CardTitle = ({ className, ...p }) => <h2 className={cn('text-sm font-medium text-foreground', className)} {...p} />
export const CardContent = ({ className, ...p }) => <div className={cn('p-4', className)} {...p} />
