import { Search } from 'lucide-react'
import { searchData } from '@/features/command/model'
import { shortcutLabel, useCommandCenter } from '@/features/command/CommandCenter'

/**
 * Kept for callers and tests: the grouped search across pages and the user's own data now lives in the Command Center's model.
 * Returns the groups as `{ title, items }`.
 */
export const searchAll = (q, data, limit = 5) => searchData(q, data, { limit })

/** The header's search field. It is a button that opens the Command Center (Ctrl/Cmd + K opens it from anywhere). */
export function GlobalSearch() {
  const { open } = useCommandCenter()
  return (
    <button
      type="button"
      onClick={open}
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+K Meta+K"
      className="lt-press flex h-10 items-center gap-2 rounded-md border border-border bg-card/60 px-2.5 text-sm text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground md:h-9 md:w-64"
    >
      <Search className="h-4 w-4" aria-hidden />
      <span className="sr-only md:not-sr-only md:flex-1 md:text-left">Search…</span>
      <kbd
        aria-hidden
        className="hidden rounded border border-border bg-surface-2 px-1.5 py-px font-sans text-[10px] font-medium md:inline"
      >
        {shortcutLabel()}
      </kbd>
    </button>
  )
}
