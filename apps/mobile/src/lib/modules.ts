import type { ComponentProps } from 'react'
import type { Ionicons } from '@expo/vector-icons'

export type IconName = ComponentProps<typeof Ionicons>['name']
/** The 12 product areas (same set as the web app's navigation). Screens are built in Phase 4. */
export const MODULES: { slug: string; title: string; icon: IconName; href: string }[] = [
  { slug: 'planner', title: 'Daily Planner & Tasks', icon: 'calendar-outline', href: '/planner' },
  { slug: 'learning', title: 'Career & Learning', icon: 'school-outline', href: '/module/learning' },
  { slug: 'jobs', title: 'Job Switch Tracker', icon: 'briefcase-outline', href: '/module/jobs' },
  { slug: 'fitness', title: 'Fitness', icon: 'barbell-outline', href: '/module/fitness' },
  { slug: 'health', title: 'Sleep & Health', icon: 'heart-outline', href: '/module/health' },
  { slug: 'finance', title: 'Finance', icon: 'wallet-outline', href: '/finance' },
  { slug: 'habits', title: 'Habits', icon: 'repeat-outline', href: '/habits' },
  { slug: 'focus', title: 'Focus Timer', icon: 'timer-outline', href: '/module/focus' },
  { slug: 'notes', title: 'Notes & Journal', icon: 'create-outline', href: '/module/notes' },
  { slug: 'goals', title: 'Goals & Milestones', icon: 'flag-outline', href: '/module/goals' },
  { slug: 'analytics', title: 'Analytics', icon: 'stats-chart-outline', href: '/module/analytics' },
  { slug: 'notifications', title: 'Notifications & Reminders', icon: 'notifications-outline', href: '/module/notifications' },
]
