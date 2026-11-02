import { OrbitMark } from './OrbitMark'
import { LoadingMessage } from './LoadingMessage'
import { MESSAGES } from './messages'
import { cn } from '@/lib/utils'

/** Inline loader for one card / panel / dialog (e.g. a long-running operation). `minHeight` reserves space to avoid layout shift. */
export function SectionLoader({ message = MESSAGES.sync, minHeight = 160, size = 48, className }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" data-testid="section-loader" style={{ minHeight }} className={cn('flex flex-col items-center justify-center gap-2 py-4', className)}>
      <div className="lt-delayed flex flex-col items-center gap-2"><OrbitMark size={size} /><LoadingMessage className="text-xs">{message}</LoadingMessage></div>
    </div>
  )
}
