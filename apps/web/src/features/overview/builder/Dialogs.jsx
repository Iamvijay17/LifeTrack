import { LayoutDashboard, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

/** What a workspace shows when every widget has been removed or hidden. */
export function EmptyWorkspace({ name, onAdd }) {
  return (
    <div className="lt-card flex flex-col items-center gap-3 px-6 py-14 text-center" data-testid="empty-workspace">
      <LayoutDashboard className="h-8 w-8 text-muted-foreground" aria-hidden />
      <h2 className="text-base font-semibold">{name} has no widgets yet</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Add widgets from the library, or start from a template. Your data stays where it is.
      </p>
      <Button onClick={onAdd}>
        <Plus className="h-4 w-4" aria-hidden />
        Add a widget
      </Button>
    </div>
  )
}

/**
 * Another device saved the dashboard while this one was being edited. Nothing is overwritten until the person chooses.
 * Closing it (Esc, a click outside) is not a choice: the edits stay and saving asks again.
 */
export function ConflictDialog({ conflict, onResolve }) {
  return (
    <Dialog
      open={!!conflict}
      onOpenChange={(o) => !o && onResolve('dismiss')}
      title="Your dashboard changed elsewhere"
      description="It was saved from another device or tab after you started editing. Saving now would replace that version."
      footer={
        <>
          <Button variant="outline" onClick={() => onResolve('theirs')}>
            Use the newer version
          </Button>
          <Button onClick={() => onResolve('mine')}>Keep my changes</Button>
        </>
      }
    >
      <p className="p-5 text-sm text-muted-foreground">
        “Keep my changes” saves what you have here over it. “Use the newer version” drops your edits.
      </p>
    </Dialog>
  )
}
