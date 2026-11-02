import { cn } from '@/lib/utils'

/** The animated-opacity caption. Fixed min-height so changing text never shifts layout. */
export function LoadingMessage({ children, className }) {
  return <p className={cn('lt-msg min-h-5 text-center text-sm text-muted-foreground', className)}>{children}</p>
}
