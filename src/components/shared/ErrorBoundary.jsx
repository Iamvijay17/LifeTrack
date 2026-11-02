import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Catches render errors so one bad row or component can't blank the whole app. Reset on route change via `resetKey`. */
export class ErrorBoundary extends Component {
  state = { error: null, key: this.props.resetKey }

  static getDerivedStateFromError(error) { return { error } }

  static getDerivedStateFromProps(props, state) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }

  componentDidCatch(error, info) { console.error('UI error:', error, info?.componentStack) }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 rounded-lg border border-danger/40 bg-danger/5 px-6 py-10 text-center">
        <AlertTriangle className="h-6 w-6 text-danger" />
        <h2 className="text-base font-semibold">Something went wrong on this page</h2>
        <p className="text-sm text-muted-foreground">Your data is safe. Try again, or reload the app.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => this.setState({ error: null })}>Try again</Button>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    )
  }
}
