import { LayoutDashboard, CalendarCheck, Timer, Repeat, NotebookPen, GraduationCap, Briefcase, Target, Dumbbell, HeartPulse, Wallet, BarChart3, FileText, Bell, Settings, Download } from 'lucide-react'

export const NAV_GROUPS = [
  { title: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  { title: 'Productivity', items: [
    { to: '/planner', label: 'Daily Planner', short: 'Planner', icon: CalendarCheck },
    { to: '/focus', label: 'Focus Mode', short: 'Focus', icon: Timer },
    { to: '/habits', label: 'Habits', icon: Repeat },
    { to: '/notes', label: 'Notes & Journal', short: 'Notes', icon: NotebookPen },
  ] },
  { title: 'Growth', items: [
    { to: '/learning', label: 'Career & Learning', short: 'Learning', icon: GraduationCap },
    { to: '/jobs', label: 'Job Switch', short: 'Jobs', icon: Briefcase },
    { to: '/goals', label: 'Goals & Milestones', short: 'Goals', icon: Target },
  ] },
  { title: 'Wellness', items: [
    { to: '/fitness', label: 'Gym & Fitness', short: 'Gym', icon: Dumbbell },
    { to: '/health', label: 'Sleep & Health', short: 'Health', icon: HeartPulse },
  ] },
  { title: 'Money', items: [{ to: '/finance', label: 'Finance', icon: Wallet }] },
  { title: 'Insights', items: [
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/reports', label: 'Reports', icon: FileText },
  ] },
  { title: 'System', items: [
    { to: '/notifications', label: 'Notifications', short: 'Alerts', icon: Bell },
    { to: '/settings', label: 'Settings', icon: Settings },
    { to: '/export', label: 'Data Export', short: 'Export', icon: Download },
  ] },
]
export const NAV = NAV_GROUPS.flatMap((g) => g.items)
export const MOBILE_PRIMARY = ['/', '/planner', '/habits', '/finance']
