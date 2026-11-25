import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/form'
import { useLoad } from '@/hooks/useLoad'
import { useAction } from '@/hooks/useAction'
import { RESTORE_REASONS, describeEvent, fieldLabel, formatValue } from '@lifetrack/core/audit'
import { applyRestore, previewRestore } from '@/services/platform'

/** Two steps, both in this dialog: what will change (a dry run on the server, nothing written), then an explicit confirmation. */
export function RestoreDialog({ event, onClose, onDone }) {
  const [ack, setAck] = useState(false)
  useEffect(() => setAck(false), [event?.id])
  const { data: preview, loading, error } = useLoad(() => previewRestore(event.id), [event?.id], { enabled: Boolean(event) })
  const [apply, applying] = useAction(async () => {
    const r = await applyRestore(event.id)
    if (!r.applied) throw new Error(r.message ?? RESTORE_REASONS[r.reason] ?? 'It could not be restored.')
    toast.success(r.mode === 'recreate' ? 'Record restored' : 'Earlier values restored', {
      description: 'A restore event was added to your history.',
    })
    onDone()
  })
  const can = preview?.restorable
  const message = preview && !can ? (preview.message ?? RESTORE_REASONS[preview.reason]) : null
  return (
    <Dialog
      open={Boolean(event)}
      onOpenChange={(o) => !o && !applying && onClose()}
      title={preview?.mode === 'recreate' ? 'Restore this record?' : 'Restore earlier values?'}
      description={event ? describeEvent(event) : ''}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={applying}>
            Cancel
          </Button>
          <Button onClick={() => apply()} loading={applying} disabled={!can || !ack}>
            Restore
          </Button>
        </>
      }
    >
      {loading ? (
        <p className="text-sm text-muted-foreground" role="status">
          Checking what would change…
        </p>
      ) : error ? (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      ) : (
        <div className="space-y-3 text-sm">
          {message && (
            <p role="alert" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {message}
            </p>
          )}
          {preview?.conflicts?.length > 0 && (
            <ul className="space-y-1 text-xs" aria-label="Conflicts">
              {preview.conflicts.map((c) => (
                <li key={c.field}>
                  <b>{fieldLabel(c.field)}</b> is now “{formatValue(c.field, c.current)}” (it was “{formatValue(c.field, c.expected)}” after
                  that event).
                </li>
              ))}
            </ul>
          )}
          {preview?.changes?.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">What restoring will change</caption>
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      Field
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Now
                    </th>
                    <th scope="col" className="px-3 py-2">
                      After restoring
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.changes
                    .filter((c) => !['id', 'user_id', 'created_at', 'updated_at'].includes(c.field))
                    .map((c) => (
                      <tr key={c.field} className="border-t border-border/60 align-top">
                        <th scope="row" className="px-3 py-2 font-medium">
                          {fieldLabel(c.field)}
                        </th>
                        <td className="break-words px-3 py-2">{formatValue(c.field, c.current)}</td>
                        <td className="break-words px-3 py-2 text-success">{formatValue(c.field, c.restore_to)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          {can && (
            <Checkbox
              checked={ack}
              onChange={setAck}
              label={
                preview.mode === 'recreate'
                  ? 'I want to bring this record back.'
                  : 'I understand these fields will go back to the values shown.'
              }
            />
          )}
          <p className="text-xs text-muted-foreground">
            Nothing is overwritten if the record changed after this event. Restoring adds a new event to your history.
          </p>
        </div>
      )}
    </Dialog>
  )
}
