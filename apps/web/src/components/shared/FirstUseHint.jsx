import { Lightbulb, X } from 'lucide-react'
import { automationSkip, updateOnboarding, useOnboarding } from '@/hooks/useOnboarding'
import { keycaps } from '@/lib/shortcuts'

/**
 * A one-time tip for a complex feature. It shows until it is dismissed (or the person uses the feature and calls `dismissHint`), is remembered on
 * the account, and never shows while the welcome setup is still open. `keys` (e.g. ['Mod', 'K']) adds a keyboard hint.
 */
export function FirstUseHint({ id, title, children, keys }) {
  const s = useOnboarding()
  const seen = s.offered[`hint:${id}`]
  // Automated runs (the same flag that skips the welcome) see no tips: they would shift every layout the tests measure.
  if (seen || automationSkip() || !['done', 'existing'].includes(s.status)) return null
  return (
    <aside
      role="note"
      aria-label={`Tip: ${title}`}
      data-testid={`hint-${id}`}
      className="mb-4 flex items-start gap-3 rounded-lg border border-primary-solid/30 bg-primary-solid/5 p-3 text-[13px]"
    >
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary-solid" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-muted-foreground">
          {children}
          {keys && (
            <>
              {' '}
              {keycaps(keys).map((k, i) => (
                <kbd key={i} className="mx-0.5 rounded border border-border bg-surface-2 px-1 text-[11px]">
                  {k}
                </kbd>
              ))}
            </>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={() => dismissHint(id)}
        className="-m-1 rounded-md p-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        Got it
        <X className="ml-1 inline h-3 w-3" aria-hidden />
      </button>
    </aside>
  )
}

export const dismissHint = (id) => updateOnboarding({ offered: { [`hint:${id}`]: true } })
