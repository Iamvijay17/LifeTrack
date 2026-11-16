import {
  LayoutDashboard,
  CalendarCheck,
  CalendarDays,
  CalendarClock,
  Workflow,
  Timer,
  Repeat,
  NotebookPen,
  GraduationCap,
  Briefcase,
  Target,
  Waypoints,
  Dumbbell,
  HeartPulse,
  Salad,
  Wallet,
  BarChart3,
  FileText,
  Bell,
  Settings,
  ShieldCheck,
  Download,
  LifeBuoy,
} from 'lucide-react'

export const NAV_GROUPS = [
  { title: 'Overview', items: [{ to: '/', module: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    title: 'Productivity',
    items: [
      { to: '/planner', module: 'planner', label: 'Daily Planner', short: 'Planner', icon: CalendarCheck },
      { to: '/calendar', module: 'calendar', label: 'Calendar', icon: CalendarDays },
      { to: '/recovery', module: 'recovery', label: 'Smart Recovery', short: 'Recovery', icon: CalendarClock },
      { to: '/automation', module: 'automation', label: 'Automation Studio', short: 'Automation', icon: Workflow },
      { to: '/focus', module: 'focus', label: 'Focus Mode', short: 'Focus', icon: Timer },
      { to: '/habits', module: 'habits', label: 'Habits', icon: Repeat },
      { to: '/notes', module: 'notes', label: 'Notes & Journal', short: 'Notes', icon: NotebookPen },
    ],
  },
  {
    title: 'Growth',
    items: [
      { to: '/learning', module: 'learning', label: 'Career & Learning', short: 'Learning', icon: GraduationCap },
      { to: '/jobs', module: 'jobs', label: 'Job Switch', short: 'Jobs', icon: Briefcase },
      { to: '/goals', module: 'goals', label: 'Goals & Milestones', short: 'Goals', icon: Target },
      { to: '/map', module: 'lifemap', label: 'Life Map', short: 'Map', icon: Waypoints },
    ],
  },
  {
    title: 'Wellness',
    items: [
      { to: '/fitness', module: 'fitness', label: 'Gym & Fitness', short: 'Gym', icon: Dumbbell },
      { to: '/health', module: 'health', label: 'Sleep & Health', short: 'Health', icon: HeartPulse },
      { to: '/nutrition', module: 'nutrition', label: 'Food & Nutrition', short: 'Food', icon: Salad },
    ],
  },
  { title: 'Money', items: [{ to: '/finance', module: 'finance', label: 'Finance', icon: Wallet }] },
  {
    title: 'Insights',
    items: [
      { to: '/analytics', module: 'analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/reports', module: 'reports', label: 'Reports', icon: FileText },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/notifications', module: 'notifications', label: 'Notifications', short: 'Alerts', icon: Bell },
      { to: '/settings', module: 'settings', label: 'Settings', icon: Settings },
      { to: '/security', module: 'security', label: 'Security & Privacy', short: 'Security', icon: ShieldCheck },
      { to: '/export', module: 'export', label: 'Data Export', short: 'Export', icon: Download },
      { to: '/help', module: 'help', label: 'Help & Support', short: 'Help', icon: LifeBuoy },
    ],
  },
]
export const NAV = NAV_GROUPS.flatMap((g) => g.items)
export const MOBILE_PRIMARY = ['/', '/planner', '/habits', '/finance']

/** The browser tab title for a route. */
export function pageTitle(pathname) {
  const page = NAV.find((n) => n.to === pathname)
  return page ? `${page.label} · LifeTrack` : 'LifeTrack'
}

// ------------------------------------------------------- personal arrangement (Settings → Appearance → Navigation)
/** Most favourites that fit the phone's bottom bar next to "More". */
export const MAX_PINNED = 4

const stable = (items, order) => {
  const rank = (it, i) => {
    const at = order.indexOf(it.to)
    return at < 0 ? order.length + i : at
  }
  return items
    .map((it, i) => [rank(it, i), it])
    .sort((a, b) => a[0] - b[0])
    .map(([, it]) => it)
}

/**
 * The navigation as this person arranged it: favourites first (shown once, not again in their group), then the groups with their items in
 * the saved order. Unknown paths in the saved lists are ignored; pages added later keep their default place.
 * @param {{ order?: string[], pinned?: string[] }} sidebar
 */
export function arrangeNav(sidebar = {}) {
  const order = sidebar.order ?? []
  const pinned = (sidebar.pinned ?? []).map((to) => NAV.find((n) => n.to === to)).filter(Boolean)
  const isPinned = new Set(pinned.map((n) => n.to))
  const groups = NAV_GROUPS.map((g) => ({ title: g.title, items: stable(g.items, order).filter((n) => !isPinned.has(n.to)) })).filter(
    (g) => g.items.length,
  )
  return { pinned, groups }
}

/** The phone's bottom bar: the favourites when there are any, otherwise the standard four. */
export function mobilePrimaryItems(sidebar = {}) {
  const { pinned } = arrangeNav(sidebar)
  return pinned.length ? pinned.slice(0, MAX_PINNED) : NAV.filter((n) => MOBILE_PRIMARY.includes(n.to))
}

/** Move `to` one place up (-1) or down (+1) inside its own group; returns the new full `order`. */
export function moveNavItem(order, to, by) {
  const group = NAV_GROUPS.find((g) => g.items.some((n) => n.to === to))
  if (!group) return order
  const inGroup = stable(group.items, order).map((n) => n.to)
  const at = inGroup.indexOf(to)
  const next = at + by
  if (next < 0 || next >= inGroup.length) return order
  inGroup.splice(next, 0, inGroup.splice(at, 1)[0])
  const others = NAV.map((n) => n.to).filter((p) => !inGroup.includes(p))
  const keep = (order ?? []).filter((p) => others.includes(p))
  return [...keep, ...inGroup]
}
