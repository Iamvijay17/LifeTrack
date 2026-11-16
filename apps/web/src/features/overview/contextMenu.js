import { ExternalLink, Plus, RefreshCw, SlidersHorizontal } from 'lucide-react'
import { widgetDef } from '@lifetrack/core/dashboardBuilder'
import { SEPARATOR } from '@/components/context-menu/items'

/** Where a widget's own module lives, for "Open …" (only widgets that belong to a page). */
const WIDGET_PAGE = {
  priorities: { to: '/planner', label: 'Daily Planner' },
  upcoming: { to: '/calendar', label: 'Calendar' },
  calendar: { to: '/calendar', label: 'Calendar' },
  today: { to: '/planner', label: 'Daily Planner' },
  learning: { to: '/learning', label: 'Career & Learning', module: 'learning' },
  jobs: { to: '/jobs', label: 'Job Switch', module: 'jobs' },
  interviews: { to: '/jobs', label: 'Job Switch', module: 'jobs' },
  fitness: { to: '/fitness', label: 'Gym & Fitness', module: 'fitness' },
  sleep: { to: '/health', label: 'Sleep & Health', module: 'health' },
  habits: { to: '/habits', label: 'Habits' },
  spending: { to: '/finance', label: 'Finance', module: 'finance' },
  budget: { to: '/finance', label: 'Finance', module: 'finance' },
  transactions: { to: '/finance', label: 'Finance', module: 'finance' },
  goals: { to: '/goals', label: 'Goals' },
  nutrition: { to: '/nutrition', label: 'Food & Nutrition', module: 'nutrition' },
  notes: { to: '/notes', label: 'Notes', module: 'notes' },
  focus: { to: '/focus', label: 'Focus' },
  weekly: { to: '/analytics', label: 'Analytics' },
  score: { to: '/analytics', label: 'Analytics' },
}

/** Dashboard, empty space: refresh, edit the dashboard, add a widget. */
export function dashboardPageMenu({ editing, refresh, edit, addWidget }) {
  return [
    { label: 'Refresh data', icon: RefreshCw, onSelect: refresh, success: 'Dashboard refreshed' },
    { label: 'Edit dashboard', icon: SlidersHorizontal, hidden: editing, onSelect: edit },
    SEPARATOR,
    { label: 'Add widget', icon: Plus, onSelect: addWidget },
  ]
}

/** Dashboard, a widget: open its module and edit the dashboard. While editing, the widget's own edit actions replace "Open". */
export function dashboardWidgetMenu({ widget, editing, go, edit, menu }) {
  const def = widgetDef(widget.type)
  if (!def) return []
  const page = WIDGET_PAGE[widget.type]
  if (editing) return [{ type: 'label', label: widget.title || def.label }, ...menu.map((m) => ({ ...m, onSelect: m.onClick }))]
  return [
    { type: 'label', label: widget.title || def.label },
    page && { label: `Open ${page.label}`, icon: ExternalLink, module: page.module, onSelect: () => go(page.to) },
    { label: 'Edit dashboard', icon: SlidersHorizontal, onSelect: edit },
  ]
}
