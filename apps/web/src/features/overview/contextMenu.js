import { EyeOff, Maximize2, Plus, RefreshCw, RotateCcw, SlidersHorizontal, ExternalLink } from 'lucide-react'
import { COMMAND_WIDGETS, WIDGET_SIZES, isCustomized, widgetSize } from '@lifetrack/core/commandCenter'
import { isWidgetOn } from '@lifetrack/core/dashboard'
import { SEPARATOR } from '@/components/context-menu/items'

const BY_KEY = Object.fromEntries(COMMAND_WIDGETS.map((w) => [w.key, w]))

/** Where a widget's own module lives, for "Open …" (only widgets that belong to a page). */
const WIDGET_PAGE = {
  priorities: { to: '/planner', label: 'Daily Planner' },
  upcoming: { to: '/calendar', label: 'Calendar' },
  learning: { to: '/learning', label: 'Career & Learning', module: 'learning' },
  jobs: { to: '/jobs', label: 'Job Switch', module: 'jobs' },
  fitness: { to: '/fitness', label: 'Gym & Fitness', module: 'fitness' },
  sleep: { to: '/health', label: 'Sleep & Health', module: 'health' },
  habits: { to: '/habits', label: 'Habits' },
  spending: { to: '/finance', label: 'Finance', module: 'finance' },
  goals: { to: '/goals', label: 'Goals' },
  nutrition: { to: '/nutrition', label: 'Food & Nutrition', module: 'nutrition' },
  weekly: { to: '/analytics', label: 'Analytics' },
  score: { to: '/analytics', label: 'Analytics' },
}

/** Dashboard, empty space: refresh, customize, add a widget back, reset the layout. */
export function dashboardPageMenu({ prefs, layout, refresh, customize }) {
  const hiddenWidgets = COMMAND_WIDGETS.filter((w) => !isWidgetOn(prefs, w.key))
  return [
    { label: 'Refresh data', icon: RefreshCw, onSelect: refresh, success: 'Dashboard refreshed' },
    { label: 'Customize dashboard', icon: SlidersHorizontal, onSelect: customize },
    {
      label: 'Add widget',
      icon: Plus,
      hidden: hiddenWidgets.length === 0,
      items: () =>
        hiddenWidgets.map((w) => ({
          label: w.label,
          onSelect: () => {
            layout.setVisible(w.key, true)
            return { message: `${w.label} added`, undo: () => layout.setVisible(w.key, false) }
          },
        })),
    },
    SEPARATOR,
    {
      label: 'Reset layout',
      icon: RotateCcw,
      hidden: !isCustomized(prefs),
      onSelect: () => {
        const before = layout.reset()
        return { message: 'Dashboard layout restored', undo: () => layout.restore(before) }
      },
    },
  ]
}

/** Dashboard, a widget: open its module, resize it, hide it. */
export function dashboardWidgetMenu({ key, prefs, layout, go }) {
  const widget = BY_KEY[key]
  if (!widget) return []
  const page = WIDGET_PAGE[key]
  const size = widgetSize(prefs, key)
  return [
    { type: 'label', label: widget.label },
    page && { label: `Open ${page.label}`, icon: ExternalLink, module: page.module, onSelect: () => go(page.to) },
    {
      label: 'Widget size',
      icon: Maximize2,
      hidden: widget.sizes.length < 2,
      items: () =>
        WIDGET_SIZES.filter((s) => widget.sizes.includes(s.key)).map((s) => ({
          label: s.label,
          radio: true,
          checked: size === s.key,
          onSelect: () => {
            const was = size
            layout.setSize(key, s.key)
            return { message: `${widget.label}: ${s.label.toLowerCase()}`, undo: () => layout.setSize(key, was) }
          },
        })),
    },
    {
      label: 'Hide widget',
      icon: EyeOff,
      onSelect: () => {
        layout.setVisible(key, false)
        return { message: `${widget.label} hidden`, undo: () => layout.setVisible(key, true) }
      },
    },
  ]
}
