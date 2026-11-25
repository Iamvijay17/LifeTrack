import { AlertCircle, Check, LayoutTemplate, Loader2, Plus, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** The little "Saving… / Saved / Couldn't save" note. Quiet when nothing has happened. */
export function SaveNote({ status, className }) {
  if (status.state === 'idle') return null
  const Icon = status.state === 'saving' ? Loader2 : status.state === 'saved' ? Check : AlertCircle
  return (
    <span
      role="status"
      data-testid="save-note"
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        status.state === 'error' ? 'text-danger' : 'text-muted-foreground',
        className,
      )}
    >
      <Icon className={cn('h-3.5 w-3.5', status.state === 'saving' && 'animate-spin')} aria-hidden />
      {status.state === 'saving' ? 'Saving…' : status.state === 'saved' ? 'Saved' : "Couldn't save"}
    </span>
  )
}

/** Shown while the dashboard is in edit mode: it says so plainly, and holds Save and Cancel. */
export function EditBar({ dirty, status, onAdd, onTemplates, onReset, onCancel, onSave }) {
  const saving = status.state === 'saving'
  return (
    <div
      role="region"
      aria-label="Editing dashboard"
      data-testid="edit-bar"
      className="sticky top-2 z-30 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-primary/50 bg-card/95 p-2.5 shadow-overlay backdrop-blur md:top-3"
    >
      <span className="mr-auto flex min-w-0 items-center gap-2 px-1 text-sm font-medium">
        <SlidersHorizontal className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="truncate">Editing dashboard</span>
        <span className="hidden text-xs font-normal text-muted-foreground sm:inline">
          {dirty ? 'Unsaved changes' : 'Drag, resize or add widgets'}
        </span>
      </span>
      <SaveNote status={status} />
      <Button size="sm" variant="outline" onClick={onAdd}>
        <Plus className="h-4 w-4" aria-hidden />
        Add widget
      </Button>
      <Button size="sm" variant="outline" onClick={onTemplates}>
        <LayoutTemplate className="h-4 w-4" aria-hidden />
        Templates
      </Button>
      <Button size="sm" variant="ghost" onClick={onReset} aria-label="Reset layout">
        <RotateCcw className="h-4 w-4" aria-hidden />
        <span className="hidden md:inline">Reset</span>
      </Button>
      <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>
        Cancel
      </Button>
      <Button size="sm" onClick={onSave} loading={saving}>
        Save
      </Button>
    </div>
  )
}
