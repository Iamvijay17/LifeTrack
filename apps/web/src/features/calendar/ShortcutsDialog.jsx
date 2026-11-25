import { Dialog } from '@/components/ui/dialog'

export const SHORTCUTS = [
  ['T', 'Go to today'],
  ['D', 'Day view'],
  ['W', 'Week view'],
  ['M', 'Month view'],
  ['A', 'Agenda view'],
  ['J or →', 'Next day, week or month'],
  ['K or ←', 'Previous day, week or month'],
  ['N or C', 'New event'],
  ['Shift N', 'New task'],
  ['G', 'Go to a date'],
  ['/', 'Search'],
  ['?', 'Show this list'],
  ['Esc', 'Close, clear search, or cancel a drag'],
  ['Alt + ↑ ↓ ← →', 'Move the focused item by 15 minutes or a day'],
  ['Shift Alt + ↑ ↓', 'Make the focused item shorter or longer'],
]

export function ShortcutsDialog({ open, onOpenChange }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Keyboard shortcuts"
      description="They work on this page whenever you are not typing in a box."
    >
      <dl className="divide-y divide-border">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={keys} className="flex items-center justify-between gap-4 py-2 text-sm">
            <dt className="text-muted-foreground">{what}</dt>
            <dd>
              <kbd className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs">{keys}</kbd>
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  )
}
