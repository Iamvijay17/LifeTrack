export const WIDGETS = [
  { key: 'score', label: 'Daily score' },
  { key: 'progress', label: "Today's progress" },
  { key: 'priorities', label: 'Top priorities & tasks' },
  { key: 'stats', label: 'Today at a glance' },
  { key: 'goals', label: 'Goal progress' },
  { key: 'spending', label: 'Monthly spending' },
  { key: 'weekly', label: 'Weekly score chart' },
  { key: 'activity', label: 'Recent activity' },
  { key: 'quick', label: 'Quick actions' },
]
/** A widget is visible unless the user explicitly turned it off (so new widgets appear by default). */
export const isWidgetOn = (prefs, key) => prefs?.[key] !== false
