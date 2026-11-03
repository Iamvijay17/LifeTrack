import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Catches render-time exceptions so one broken component can't white-screen the app.
 * `resetKey` (e.g. the pathname) clears the error when it changes, so navigating away recovers automatically.
 * `variant="page"` fills the viewport (root); `variant="section"` renders inside the shell (route).
 */
export class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('LifeTrack render error:', error, info?.componentStack)
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    const page = this.props.variant === 'page'
    return (
      <div
        role="alert"
        className={page ? 'grid min-h-dvh place-items-center bg-background p-6' : 'grid min-h-[50dvh] place-items-center p-6'}
      >
        <div className="flex max-w-md flex-col items-center gap-3 rounded-lg border border-danger/40 bg-danger/5 px-6 py-8 text-center">
          <AlertTriangle className="h-6 w-6 text-danger" aria-hidden />
          <h2 className="text-base font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">
            This part of LifeTrack hit an unexpected error. Your saved data is safe — nothing was lost.
          </p>
          <div className="mt-1 flex gap-2">
            <Button variant="outline" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </div>
        </div>
      </div>
    )
  }
}
