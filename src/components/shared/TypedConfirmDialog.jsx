import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/form'

/**
 * A confirmation for irreversible actions: the confirm button stays disabled until the user types `phrase` exactly.
 * While `pending` the dialog cannot be dismissed. `children` is shown above the input (warnings, progress…).
 */
export function TypedConfirmDialog({ open, onOpenChange, title, description, phrase, confirmLabel, pending = false, onConfirm, children }) {
  const [typed, setTyped] = useState('')
  useEffect(() => {
    if (open) setTyped('')
  }, [open])
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !pending && onOpenChange(o)}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" loading={pending} disabled={typed !== phrase} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      <Field label={`Type ${phrase} to confirm`}>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </Field>
    </Dialog>
  )
}
