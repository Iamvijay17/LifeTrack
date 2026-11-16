import { Copy, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Menu } from '@/components/ui/menu'
import { MAX_WORKSPACES } from '@lifetrack/core/dashboardBuilder'
import { useConfirm } from '@/components/shared/Confirm'
import { usePrompt } from '@/components/shared/Prompt'
import { cn } from '@/lib/utils'

/**
 * The workspace tabs: switch with one tap (no reload), add one, and manage the current one (rename, duplicate, make default, delete).
 * The tab row scrolls on its own, so many workspaces never push the page sideways on a phone.
 */
export function WorkspaceBar({ state, active, ops, onSelect }) {
  const ask = usePrompt()
  const confirm = useConfirm()
  const only = state.workspaces.length === 1
  const isDefault = state.defaultId === active.id
  const create = async () => {
    const name = await ask({ title: 'New workspace', label: 'Name', value: '', confirmLabel: 'Create' })
    if (name) ops.createWorkspace(name)
  }
  const rename = async () => {
    const name = await ask({ title: 'Rename workspace', label: 'Name', value: active.name, confirmLabel: 'Rename' })
    if (name) ops.renameWorkspace(active.id, name)
  }
  const remove = async () => {
    if (
      await confirm({
        title: `Delete “${active.name}”?`,
        description: 'Only this dashboard layout is deleted. Your tasks, habits, goals and other data are not affected.',
        confirmLabel: 'Delete workspace',
      })
    )
      ops.deleteWorkspace(active.id)
  }
  return (
    <div className="flex items-center gap-2" data-testid="workspace-bar">
      <div className="-mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 py-1">
        <div role="tablist" aria-label="Dashboard workspaces" className="flex gap-1">
          {state.workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              role="tab"
              aria-selected={w.id === active.id}
              data-sound="select"
              onClick={() => onSelect(w.id)}
              className={cn(
                'lt-press inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors md:min-h-8',
                w.id === active.id
                  ? 'border-primary/60 bg-primary/15 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {w.id === state.defaultId && <Star className="h-3 w-3 fill-current text-warning" aria-label="Default workspace" role="img" />}
              {w.name}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0"
          onClick={create}
          disabled={state.workspaces.length >= MAX_WORKSPACES}
          aria-label="New workspace"
        >
          <Plus className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">New</span>
        </Button>
      </div>
      <Menu
        label={`Manage ${active.name}`}
        items={[
          { label: 'Rename', icon: Pencil, onClick: rename },
          {
            label: 'Duplicate',
            icon: Copy,
            hidden: state.workspaces.length >= MAX_WORKSPACES,
            onClick: () => ops.duplicateWorkspace(active.id),
          },
          {
            label: isDefault ? 'Default workspace' : 'Make default',
            icon: Star,
            hidden: isDefault,
            onClick: () => ops.setDefault(active.id),
          },
          { label: 'Delete workspace', icon: Trash2, danger: true, hidden: only, onClick: remove },
        ]}
      />
    </div>
  )
}
