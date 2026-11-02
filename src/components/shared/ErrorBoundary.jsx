import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Catches render errors and failed lazy-chunk loads (e.g. right after a deploy) so the user never sees a blank page. */
export class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) { if (import.meta.env.DEV) console.error(error) }
  render() {
    if (!this.state.error) return this.props.children
    const chunk = /Loading chunk|dynamically imported module|Importing a module script failed/i.test(String(this.state.error?.message))
    return (
      <div role="alert" className="mx-auto my-16 flex max-w-md flex-col items-center gap-3 rounded-lg border border-danger/40 bg-danger/5 px-6 py-8 text-center">
        <AlertTriangle className="h-6 w-6 text-danger" aria-hidden />
        <h1 className="text-base font-semibold">{chunk ? 'A new version is available' : 'Something went wrong'}</h1>
        <p className="text-sm text-muted-foreground">
          {chunk ? 'Reload to get the latest version. Your saved data is not affected.' : 'This page hit an unexpected error. Your saved data is not affected.'}
        </p>
        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>Reload</Button>
          {!chunk && <Button variant="outline" onClick={() => this.setState({ error: null })}>Try again</Button>}
        </div>
      </div>
    )
  }
}
