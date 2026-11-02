import type { ComponentProps } from 'react'
import type { Ionicons } from '@expo/vector-icons'

export type IconName = ComponentProps<typeof Ionicons>['name']
/** The 12 product areas (same set as the web app's navigation). Screens are built in Phase 4. */
export const MODULES: { slug: string; title: string; icon: IconName }[] = [
  { slug: 'planner', title: 'Daily Planner & Tasks', icon: 'calendar-outline' },
  { slug: 'learning', title: 'Career & Learning', icon: 'school-outline' },
  { slug: 'jobs', title: 'Job Switch Tracker', icon: 'briefcase-outline' },
  { slug: 'fitness', title: 'Fitness', icon: 'barbell-outline' },
  { slug: 'health', title: 'Sleep & Health', icon: 'heart-outline' },
  { slug: 'finance', title: 'Finance', icon: 'wallet-outline' },
  { slug: 'habits', title: 'Habits', icon: 'repeat-outline' },
  { slug: 'focus', title: 'Focus Timer', icon: 'timer-outline' },
  { slug: 'notes', title: 'Notes & Journal', icon: 'create-outline' },
  { slug: 'goals', title: 'Goals & Milestones', icon: 'flag-outline' },
  { slug: 'analytics', title: 'Analytics', icon: 'stats-chart-outline' },
]
