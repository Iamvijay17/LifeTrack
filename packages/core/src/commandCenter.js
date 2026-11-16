// The web Life Command Center's widget registry and layout rules. Layout lives in `user_settings.dashboard_widgets` (a json column), so it
// is saved per user and follows them to every device, and needs no migration:
//   { [widgetKey]: false }        hides a widget (anything not `false` is shown, so widgets added later appear by default)
//   { order: [widgetKey, ...] }   the user's order
//   { sizes: { [widgetKey]: 'sm' | 'md' | 'lg' | 'full' } }   the width the user picked
// The mobile app reads the same column with its own, shorter widget list; it ignores keys it does not know and keeps the ones it does not write.
import { WIDGETS_NEEDING_DATA, arrangeWidgets, isWidgetOn, widgetOrder } from './dashboard'

/** Widths on the 12-column grid used from the `lg` breakpoint; narrower screens stack widgets in one column. */
export const WIDGET_SIZES = [
  { key: 'sm', label: 'Small', span: 4 },
  { key: 'md', label: 'Medium', span: 6 },
  { key: 'lg', label: 'Large', span: 8 },
  { key: 'full', label: 'Full width', span: 12 },
]
const SIZE_KEYS = WIDGET_SIZES.map((s) => s.key)
const SPAN = Object.fromEntries(WIDGET_SIZES.map((s) => [s.key, s.span]))

const ALL = SIZE_KEYS
const FROM_MD = ['md', 'lg', 'full']
const FULL_ONLY = ['full']

/**
 * Every widget on the web dashboard, in the order a new account sees them. `size` is the default width and `sizes` the widths that widget
 * is built for (a ring and a row of bars needs more room than a list). `module` selects the accent colour.
 */
export const COMMAND_WIDGETS = [
  { key: 'getting_started', label: 'Getting started guide', size: 'full', sizes: FULL_ONLY },
  { key: 'today', label: 'Today agenda', size: 'lg', sizes: FROM_MD },
  { key: 'score', label: 'Life Score', size: 'sm', sizes: ALL },
  { key: 'progress', label: "Today's progress", size: 'lg', sizes: FROM_MD },
  { key: 'priorities', label: 'Top priorities & tasks', size: 'sm', sizes: ALL },
  { key: 'stats', label: 'Today at a glance', size: 'full', sizes: FULL_ONLY },
  { key: 'weekly', label: 'Life Score trends', size: 'lg', sizes: FROM_MD },
  { key: 'upcoming', label: 'Upcoming deadlines', size: 'sm', sizes: ALL },
  { key: 'learning', label: 'Career & learning', size: 'md', sizes: ALL },
  { key: 'jobs', label: 'Job switch', size: 'md', sizes: ALL },
  { key: 'fitness', label: 'Gym & fitness', size: 'md', sizes: ALL },
  { key: 'sleep', label: 'Sleep & health', size: 'md', sizes: ALL },
  { key: 'habits', label: 'Habits & routine', size: 'md', sizes: ALL },
  { key: 'spending', label: 'Finance', size: 'md', sizes: ALL },
  { key: 'goals', label: 'Goal progress', size: 'sm', sizes: ALL },
  { key: 'nutrition', label: 'Food & nutrition', size: 'sm', sizes: ALL },
  { key: 'activity', label: 'Recent activity', size: 'sm', sizes: ALL },
  { key: 'quick', label: 'Quick actions', size: 'full', sizes: FULL_ONLY },
]
const BY_KEY = Object.fromEntries(COMMAND_WIDGETS.map((w) => [w.key, w]))
export const COMMAND_KEYS = COMMAND_WIDGETS.map((w) => w.key)

/** Widgets that are only empty states until something has been logged: a brand-new account sees the getting-started guide instead of them. */
export const COMMAND_NEEDING_DATA = [...WIDGETS_NEEDING_DATA, 'learning', 'jobs', 'fitness', 'sleep', 'habits']

/** Keys of `dashboard_widgets` that are not widgets, so a widget can never be named after one. */
export const RESERVED_PREFS = ['order', 'sizes']

/** The widget's chosen size, or its default when none was saved, the saved value is unknown, or this widget is not built for that width. */
export function widgetSize(prefs, key) {
  const widget = BY_KEY[key]
  if (!widget) return 'full'
  const saved = prefs?.sizes?.[key]
  return widget.sizes.includes(saved) ? saved : widget.size
}

/** Widget keys in the user's order; saved keys first, widgets added later in their default place. */
export const commandOrder = (prefs) => widgetOrder(prefs, COMMAND_KEYS)

/**
 * The visible widgets laid out in rows of 12 columns, each { key, size, span }. A row that ends short is stretched, so hiding or moving a
 * widget never leaves a hole; `size` is what the user picked and `span` what it was given. Below the `lg` breakpoint widgets stack in one column
 * (the sidebar leaves a tablet too little room for two). `isVisible(key)` lets the caller hold back widgets that have nothing to show yet.
 */
export function layoutOf(prefs, isVisible = () => true) {
  const keys = commandOrder(prefs).filter((k) => isWidgetOn(prefs, k) && isVisible(k))
  const size = Object.fromEntries(keys.map((k) => [k, widgetSize(prefs, k)]))
  return arrangeWidgets(keys, (k) => SPAN[size[k]]).map(({ key, span }) => ({ key, size: size[key], span }))
}

/** Return `prefs` with one widget shown or hidden. */
export const withVisibility = (prefs, key, on) => ({ ...prefs, [key]: on })

/** Return `prefs` with one widget's size set (an unknown size, or one the widget is not built for, is ignored). */
export function withSize(prefs, key, size) {
  if (!BY_KEY[key]?.sizes.includes(size)) return prefs ?? {}
  return { ...prefs, sizes: { ...prefs?.sizes, [key]: size } }
}

/** Return `prefs` with the order replaced. Keys that are not widgets are dropped. */
export const withOrder = (prefs, order) => ({ ...prefs, order: order.filter((k) => COMMAND_KEYS.includes(k)) })

/** Move one widget up (-1) or down (+1) in the full order; returns the new order, unchanged at either end. */
export function moveWidget(order, key, by) {
  const at = order.indexOf(key)
  const to = at + by
  if (at < 0 || to < 0 || to >= order.length) return order
  const next = [...order]
  next.splice(at, 1)
  next.splice(to, 0, key)
  return next
}

/** The default layout: nothing saved, so every widget is shown in its default place and size. */
export const defaultLayoutPrefs = () => ({})

/** True when the user has changed anything from the default. */
export const isCustomized = (prefs) =>
  !!prefs &&
  Object.entries(prefs).some(([k, v]) => {
    if (k === 'order') return Array.isArray(v) && v.length > 0 && v.join() !== COMMAND_KEYS.slice(0, v.length).join()
    if (k === 'sizes') return v && Object.keys(v).length > 0
    return v === false
  })
