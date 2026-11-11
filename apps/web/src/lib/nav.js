import {
  LayoutDashboard,
  CalendarCheck,
  CalendarDays,
  Timer,
  Repeat,
  NotebookPen,
  GraduationCap,
  Briefcase,
  Target,
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
