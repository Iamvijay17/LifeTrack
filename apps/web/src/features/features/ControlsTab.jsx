import { useState } from 'react'
import { OctagonAlert, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Switch } from '@/components/ui/form'
import { useConfirm } from '@/components/shared/Confirm'
import { PROTECTED_FLAGS } from '@lifetrack/core/flags'
import { setControls } from '@/services/platform'
import { stamp } from '@/features/developers/shared'

/** Emergency controls: stop everything experimental, one module, or every non-protected flag. Sign-in, security, data integrity and recovery can never be stopped. */
export function ControlsTab({ data, reload }) {
  const confirm = useConfirm()
  const c = data.controls
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const modules = [...new Set(data.flags.filter((f) => f.module).map((f) => f.module))].sort()
  const apply = async (patch, title, description) => {
    if (reason.trim().length < 3) return toast.error('Say why first (at least 3 characters): it goes in the history.')
    if (!(await confirm({ title, description, confirmLabel: 'Apply', destructive: true }))) return
    setBusy(true)
    try {
      await setControls(patch, reason.trim())
      toast.success('Emergency control applied.')
      setReason('')
      reload()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }
  const active = c.global_disable || c.experiments_disabled || c.disabled_modules.length > 0
  return (
    <div className="space-y-4">
      {active && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger/50 bg-danger/10 p-3 text-sm"
          data-testid="controls-active"
        >
          <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
          <span>
            Emergency controls are active{c.reason ? `: “${c.reason}”` : ''}. Last changed {stamp(c.updated_at)}.
          </span>
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle as="h3">Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Reason" hint="Required for every change. Shown in the history and the audit log.">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              placeholder="For example: Insights is slow after the last release"
            />
          </Field>
          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
            <span className="text-sm">
              <span className="font-medium">Stop all experiments</span>
              <span className="block text-xs text-muted-foreground">
                Every experimental flag turns off and nobody is enrolled. Release flags are not touched.
              </span>
            </span>
            <Switch
              checked={c.experiments_disabled}
              label="Stop all experiments"
              onChange={(v) =>
                !busy &&
                apply(
                  { experiments_disabled: v },
                  v ? 'Stop all experiments?' : 'Allow experiments again?',
                  v
                    ? 'Experimental features switch off for everyone within about a minute.'
                    : 'Experiments that are running start enrolling people again.',
                )
              }
            />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
            <span className="text-sm">
              <span className="font-medium">Switch off every optional feature</span>
              <span className="block text-xs text-muted-foreground">
                Global kill switch: all flags except the protected ones evaluate to off. Your data is untouched.
              </span>
            </span>
            <Switch
              checked={c.global_disable}
              label="Switch off every optional feature"
              onChange={(v) =>
                !busy &&
                apply(
                  { global_disable: v },
                  v ? 'Switch off every optional feature?' : 'Switch features back on?',
                  v
                    ? 'Modules controlled by flags disappear from the menu for everyone. Sign-in, security, data integrity and recovery stay on.'
                    : 'Flags go back to their own settings.',
                )
              }
            />
          </div>
          <div className="border-t border-border/60 pt-3">
            <p className="mb-2 text-sm font-medium">Switch off one module</p>
            {!modules.length ? (
              <p className="text-xs text-muted-foreground">No flag is attached to a module yet.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {modules.map((m) => (
                  <li key={m} className="flex items-center justify-between rounded-md border border-border p-2.5 text-sm">
                    <span>{m}</span>
                    <Switch
                      checked={c.disabled_modules.includes(m)}
                      label={`Switch off ${m}`}
                      onChange={(v) =>
                        !busy &&
                        apply(
                          { disabled_modules: v ? [...c.disabled_modules, m] : c.disabled_modules.filter((x) => x !== m) },
                          `${v ? 'Switch off' : 'Switch on'} the ${m} module?`,
                          v ? 'Its flags evaluate to off for everyone.' : 'Its flags go back to their own settings.',
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h3" className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-success" aria-hidden /> Never switched off
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-sm">
            {PROTECTED_FLAGS.map((p) => (
              <li key={p.key}>
                <span className="font-medium">{p.name}</span> <span className="text-muted-foreground">— {p.description}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
