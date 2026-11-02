import { OrbitMark } from './OrbitMark'
import { LoadingMessage } from './LoadingMessage'
import { MESSAGES } from './messages'

/** Route-level fallback: fills the content area (the app shell stays on screen). Fades in only if loading lingers. */
export function PageLoader({ message = MESSAGES.sync }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" data-testid="page-loader" className="flex min-h-[60dvh] flex-col items-center justify-center gap-4">
      <div className="lt-delayed flex flex-col items-center gap-4"><OrbitMark size={80} /><LoadingMessage>{message}</LoadingMessage></div>
    </div>
  )
}
