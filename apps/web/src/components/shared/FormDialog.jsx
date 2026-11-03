import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/** Standard modal form: submit is disabled while saving (no duplicate submissions); the form stays open on failure. */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  pending,
  submitLabel = 'Save',
  children,
  extraFooter,
  className,
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)} title={title} description={description} className={className}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {children}
        <div className="flex items-center justify-end gap-2 pt-2">
          {extraFooter}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            {pending ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
