import { AlertTriangle } from 'lucide-react'

/** Shown instead of the app when a production build has no Supabase credentials (never silently falls back to local mode). */
export function ConfigError() {
  return (
    <div role="alert" className="grid min-h-dvh place-items-center bg-background p-6">
      <div className="max-w-lg space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-6">
        <div className="flex items-center gap-2 text-warning">
          <AlertTriangle className="h-5 w-5" aria-hidden />
          <h1 className="text-lg font-semibold">LifeTrack isn&apos;t connected to a database</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          This build was created without Supabase settings, so it can&apos;t sign anyone in or store data. Nothing has been lost.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>
            Add <code className="rounded bg-muted px-1">VITE_SUPABASE_URL</code> and{' '}
            <code className="rounded bg-muted px-1">VITE_SUPABASE_ANON_KEY</code> to your hosting environment variables.
          </li>
          <li>Redeploy — these values are read at build time, so a redeploy is required.</li>
        </ol>
        <p className="text-xs text-muted-foreground">See docs/SETUP.md in the repository for the full steps.</p>
      </div>
    </div>
  )
}
