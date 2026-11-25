import { useEffect, useId, useRef } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/shared/Confirm'

/**
 * Standard modal form: submit is disabled while saving (no duplicate submissions); the form stays open on failure; the buttons stay visible
 * while a long form scrolls. Dismissing it by accident (Esc, X, a click outside) asks first if anything was typed; the Cancel button doesn't.
 * "Typed" is any `input` event in the form: text fields, and our Select / date / time pickers, which send one when a value is picked.
 * Controls that send none (a Segmented choice) count when the dialog passes `dirty` (react-hook-form's `formState.isDirty`).
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  pending,
  submitLabel = 'Save',
  submitDisabled = false,
  children,
  extraFooter,
  className,
  dirty = false,
}) {
  const formId = useId()
  const confirm = useConfirm()
  const typed = useRef(false)
  useEffect(() => {
    if (open) typed.current = false
  }, [open])
  const dismiss = async (nextOpen) => {
    if (pending) return
    if (!nextOpen && (typed.current || dirty)) {
      const typingIn = document.activeElement
      const discard = await confirm({
        title: 'Discard your changes?',
        description: "What you've typed in this form won't be saved.",
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
      })
      if (!discard) {
        setTimeout(() => typingIn?.focus?.(), 0) // back where you were typing
        return
      }
    }
    onOpenChange(nextOpen)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={dismiss}
      title={title}
      description={description}
      className={className}
      footer={
        <>
          {extraFooter}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={pending} disabled={submitDisabled}>
            {pending ? 'Saving…' : submitLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} onInput={() => (typed.current = true)} noValidate className="space-y-4">
        {children}
      </form>
    </Dialog>
  )
}
