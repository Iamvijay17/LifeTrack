import { toast } from 'sonner'
import { Bookmark, BookmarkPlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form'
import { usePrompt } from '@/components/shared/Prompt'
import { useConfirm } from '@/components/shared/Confirm'
import { useSavedReports } from '@/hooks/useSavedReports'
import { KIND_NAME } from './format'

/**
 * Saved report configurations: a name for a period type (and its tab, and the dates of a custom range). Applying one jumps to the CURRENT period of that
 * type, so "Monthly overview" always means this month; a custom range keeps its dates. Stored with the account (user_settings.report_prefs).
 */
export function SavedReports({ kind, custom, tab, onApply }) {
  const { saved, add, remove } = useSavedReports()
  const ask = usePrompt()
  const confirm = useConfirm()
  const save = async () => {
    const name = await ask({
      title: 'Save this report setup',
      label: 'Name',
      value: `${KIND_NAME[kind]} ${tab === 'overview' ? 'overview' : tab}`,
      confirmLabel: 'Save',
      validate: (t) => (t.length > 40 ? 'Use at most 40 characters.' : null),
    })
    if (!name) return
    try {
      await add({ name, kind, tab, ...(kind === 'custom' ? custom : {}) })
      toast.success(`Saved “${name}”`)
    } catch (e) {
      toast.error(e.message)
    }
  }
  const del = async (s) => {
    if (
      !(await confirm({
        title: `Delete “${s.name}”?`,
        description: 'Only the saved setup is removed, not any data.',
        confirmLabel: 'Delete',
      }))
    )
      return
    await remove(s.id)
    toast.success('Saved report deleted')
  }
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden" data-testid="saved-reports">
      {saved.length > 0 && (
        <Select aria-label="Saved reports" className="w-52" value="" onChange={(e) => onApply(saved.find((s) => s.id === e.target.value))}>
          <option value="">Saved reports…</option>
          {saved.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      )}
      <Button variant="outline" size="sm" onClick={save}>
        <BookmarkPlus className="h-4 w-4" aria-hidden /> Save setup
      </Button>
      {saved.length > 0 && (
        <details className="relative">
          <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted/40">
            <Bookmark className="h-3.5 w-3.5" aria-hidden /> Manage
          </summary>
          <ul className="absolute z-20 mt-1 w-64 rounded-lg border border-border bg-card p-1 shadow-overlay">
            {saved.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40">
                <span className="truncate">{s.name}</span>
                <button
                  type="button"
                  aria-label={`Delete ${s.name}`}
                  className="rounded p-1 text-muted-foreground hover:text-danger"
                  onClick={() => del(s)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
