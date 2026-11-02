import { OrbitMark } from './OrbitMark'
import { LoadingMessage } from './LoadingMessage'
import { MESSAGES } from './messages'
import { cn } from '@/lib/utils'

/** Covers the viewport. For initial load and genuine full-screen transitions (sign-in → dashboard). */
export function FullScreenLoader({ message = MESSAGES.dashboard, showWordmark = true, className }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" data-testid="full-screen-loader"
      className={cn('fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-background pb-safe', className)}>
      <OrbitMark size={112} />
      {showWordmark && <span className="text-lg tracking-tight"><span className="font-medium">Life</span><span className="font-bold">Track</span></span>}
      <LoadingMessage>{message}</LoadingMessage>
    </div>
  )
}

/** First paint of the app while the session is resolved. Same markup as the static boot screen in index.html, so there is no jump. */
export function InitialAppLoader() {
  return <FullScreenLoader message={MESSAGES.dashboard} />
}
