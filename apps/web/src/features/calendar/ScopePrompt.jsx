import { useCallback, useRef, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const CHOICES = [
  { value: 'this', label: 'This event', hint: 'Only this one. The others stay as they are.' },
  { value: 'following', label: 'This and following events', hint: 'This one and every later one. Earlier ones are not touched.' },
  { value: 'all', label: 'All events', hint: 'The whole series, past and future.' },
]
const VERBS = { edit: 'Edit', delete: 'Delete', move: 'Move' }

/**
 * Asks which part of a repeating event a change applies to. `const [ask, prompt] = useScopePrompt()`, render `{prompt}` once, then
 * `const scope = await ask('edit', { disableThis: true })`  →  'this' | 'following' | 'all', or null when cancelled.
 * `disableThis` is for changes that only make sense for a series (a new repeat rule).
 */
export function useScopePrompt() {
  const [req, setReq] = useState(null)
  const [choice, setChoice] = useState('this')
  const resolver = useRef(null)
  const ask = useCallback(
    (kind, { disableThis = false, title } = {}) =>
      new Promise((resolve) => {
        resolver.current?.(null)
        resolver.current = resolve
        setChoice(disableThis ? 'following' : 'this')
        setReq({ kind, disableThis, title })
      }),
    [],
  )
  const close = (value) => {
    resolver.current?.(value)
    resolver.current = null
    setReq(null)
  }
  const prompt = (
    <Dialog
      stacked
      open={!!req}
      onOpenChange={(o) => !o && close(null)}
      title={`${VERBS[req?.kind] ?? 'Edit'} repeating event`}
      description={req?.title}
      footer={
        <>
          <Button variant="outline" onClick={() => close(null)}>
            Cancel
          </Button>
          <Button variant={req?.kind === 'delete' ? 'destructive' : 'default'} onClick={() => close(choice)}>
            {req?.kind === 'delete' ? 'Delete' : 'OK'}
          </Button>
        </>
      }
    >
      <div role="radiogroup" aria-label="Which events" className="space-y-1.5">
        {CHOICES.map((c) => {
          const off = c.value === 'this' && req?.disableThis
          return (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={choice === c.value}
              disabled={off}
              onClick={() => setChoice(c.value)}
              className={cn(
                'flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                choice === c.value ? 'border-mod bg-mod/10' : 'border-border hover:bg-muted/50',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2',
                  choice === c.value ? 'border-mod' : 'border-muted-foreground/50',
                )}
              >
                {choice === c.value && <span className="h-2 w-2 rounded-full bg-mod" />}
              </span>
              <span>
                <span className="block text-sm font-medium">{c.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {off ? 'A change to how it repeats applies to a series, not to one event.' : c.hint}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </Dialog>
  )
  return [ask, prompt]
}
