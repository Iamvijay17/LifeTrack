import { Copy, EyeOff, FolderInput, Maximize2, RotateCcw, Settings2, Trash2 } from 'lucide-react'
import { WIDGET_SIZES, canAdd, hasConfig, limitsFor, moveBlocker, sizeKeyOf, widgetDef } from '@lifetrack/core/dashboardBuilder'

/**
 * The menu behind a widget's ⋯ in edit mode: settings, size, duplicate, move to another workspace, hide, restore defaults and remove.
 * Removing only takes the card off this workspace; it never touches the records the card summarises.
 */
export function widgetMenu({ widget, workspace, state, ops, configure, confirmRemove }) {
  const def = widgetDef(widget.type)
  const current = sizeKeyOf(workspace, widget.id)
  const limits = limitsFor(widget.type, 12)
  const sizes = WIDGET_SIZES.filter((s) => s.span >= limits.minW && s.span <= limits.maxW)
  const others = state.workspaces.filter((w) => w.id !== workspace.id)
  return [
    { label: 'Settings and title', icon: Settings2, onClick: () => configure(widget) },
    ...(sizes.length > 1
      ? sizes.map((s) => ({
          label: `Size: ${s.label}${current === s.key ? ' ✓' : ''}`,
          icon: Maximize2,
          onClick: () => ops.resizeWidget(widget.id, s.key),
        }))
      : []),
    {
      label: 'Duplicate',
      icon: Copy,
      hidden: !def?.multi || !canAdd(workspace, widget.type),
      onClick: () => ops.duplicateWidget(widget.id),
    },
    ...others.map((o) => ({
      label: `Move to ${o.name}`,
      icon: FolderInput,
      hidden: !!moveBlocker(state, workspace.id, widget.id, o.id),
      onClick: () => ops.moveToWorkspace(widget.id, o.id),
    })),
    { label: 'Hide for now', icon: EyeOff, onClick: () => ops.setHidden(widget.id, true) },
    {
      label: 'Restore default settings',
      icon: RotateCcw,
      hidden: !hasConfig(widget.type) && !widget.title && current === undefined,
      onClick: () => ops.resetWidget(widget.id),
    },
    { label: 'Remove widget', icon: Trash2, danger: true, onClick: () => confirmRemove(widget) },
  ]
}
