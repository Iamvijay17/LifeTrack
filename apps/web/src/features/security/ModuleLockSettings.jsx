import { Lock } from 'lucide-react'
import { LOCKABLE_MODULES } from '@lifetrack/core/moduleLocks'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/form'
import { useAction } from '@/hooks/useAction'
import { NAV } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { security } from '@/services/security'
import { useSecurity } from './SecurityProvider'

const iconOf = (key) => NAV.find((n) => n.module === key)?.icon ?? Lock
// What "only some modules" starts with: the two the whole-app lock has always protected on the server.
const STARTER = LOCKABLE_MODULES.filter((m) => m.legacy).map((m) => m.key)

function Choice({ checked, onSelect, disabled, title, children }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-60',
        checked ? 'border-primary/60 bg-primary/5' : 'border-border hover:bg-muted/40',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border',
          checked ? 'border-primary' : 'border-muted-foreground/50',
        )}
      >
        {checked && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{children}</span>
      </span>
    </button>
  )
}

/**
 * "What to lock": the whole app, or only the modules the person ticks. Needs an unlocked session (the database refuses otherwise), so while the
 * chosen modules are closed this asks to unlock first instead of showing switches that would fail.
 */
export function ModuleLockSettings() {
  const sec = useSecurity()
  const st = sec.state
  const [save, saving] = useAction(
    async (scope, modules) => {
      await security.setLockModules(scope, modules)
      await sec.refresh()
      sec.announce('changed')
    },
    { success: 'Lock settings updated' },
  )
  if (!st?.appLockEnabled) return null
  // The database has not had migration 0015 run: say so instead of silently offering only "lock everything".
  if (!st.moduleLocksSupported)
    return (
      <p role="note" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
        Choosing which modules to lock is not installed in your database yet. Run supabase/migrations/0015_module_locks.sql in the Supabase
        SQL Editor, then reload.
      </p>
    )

  const byModules = st.lockScope === 'modules'
  const chosen = st.lockedModules
  const open = sec.sessionUnlocked
  const toggle = (key, on) => save('modules', on ? [...chosen, key] : chosen.filter((k) => k !== key))

  return (
    <div className="space-y-3 border-t border-border pt-4" data-testid="module-lock-settings">
      <div>
        <p className="text-sm font-medium">What to lock</p>
        <p className="text-xs text-muted-foreground">
          Lock everything, or only the parts you want kept private. One PIN or fingerprint opens them.
        </p>
      </div>
      {!open && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
        >
          <span>Unlock to change what is locked.</span>
          <Button size="sm" variant="outline" onClick={() => sec.requestUnlock('*')}>
            <Lock className="h-3.5 w-3.5" /> Unlock
          </Button>
        </div>
      )}
      <div role="radiogroup" aria-label="What to lock" className="grid gap-2">
        <Choice checked={!byModules} disabled={!open || saving} onSelect={() => byModules && save('app', chosen)} title="The whole app">
          LifeTrack opens behind a lock screen. Nothing is shown until you unlock.
        </Choice>
        <Choice
          checked={byModules}
          disabled={!open || saving}
          onSelect={() => byModules || save('modules', chosen.length ? chosen : STARTER)}
          title="Only the modules I choose"
        >
          LifeTrack opens as usual. The modules below show a lock on the dashboard and ask for your PIN, fingerprint or face.
        </Choice>
      </div>

      {byModules && (
        <ul className="divide-y divide-border rounded-lg border border-border" aria-label="Modules to lock">
          {LOCKABLE_MODULES.map(({ key, label, blurb }) => {
            const Icon = iconOf(key)
            const on = chosen.includes(key)
            const last = on && chosen.length === 1
            return (
              <li key={key} data-module={key} className="flex items-center gap-3 px-3 py-2.5">
                <span className="lt-icon-soft h-8 w-8 shrink-0 rounded-md">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="truncate text-xs text-muted-foreground">{last ? 'Keep one locked, or choose “The whole app”.' : blurb}</p>
                </div>
                <fieldset disabled={!open || saving || last} className="contents">
                  <Switch label={`Lock ${label}`} checked={on} onChange={(v) => open && !saving && !last && toggle(key, v)} />
                </fieldset>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
