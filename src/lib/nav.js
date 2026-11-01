import { LayoutDashboard, CalendarCheck, GraduationCap, Briefcase, Dumbbell, HeartPulse, Wallet, Repeat, BarChart3, Settings } from 'lucide-react'

export const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/planner', label: 'Daily Planner', short: 'Planner', icon: CalendarCheck },
  { to: '/learning', label: 'Career & Learning', short: 'Learning', icon: GraduationCap },
  { to: '/jobs', label: 'Job Switch', short: 'Jobs', icon: Briefcase },
  { to: '/fitness', label: 'Gym & Fitness', short: 'Gym', icon: Dumbbell },
  { to: '/health', label: 'Sleep & Health', short: 'Health', icon: HeartPulse },
  { to: '/finance', label: 'Finance', icon: Wallet },
  { to: '/habits', label: 'Habits', icon: Repeat },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
]
export const MOBILE_PRIMARY = ['/', '/planner', '/habits', '/finance']
