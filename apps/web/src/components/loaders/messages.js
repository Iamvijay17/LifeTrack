// Contextual, honest loading messages. None of them imply a percentage — progress is unknown while fetching.
export const MESSAGES = {
  dashboard: 'Preparing your dashboard...',
  planner: 'Loading your daily planner...',
  sync: 'Syncing your progress...',
  learning: 'Loading your learning journey...',
  insights: 'Preparing your insights...',
}

const BY_ROUTE = [
  ['/planner', MESSAGES.planner],
  ['/focus', MESSAGES.planner],
  ['/habits', MESSAGES.planner],
  ['/notes', MESSAGES.planner],
  ['/learning', MESSAGES.learning],
  ['/goals', MESSAGES.learning],
  ['/jobs', MESSAGES.learning],
  ['/analytics', MESSAGES.insights],
  ['/reports', MESSAGES.insights],
  ['/fitness', MESSAGES.sync],
  ['/health', MESSAGES.sync],
  ['/finance', MESSAGES.sync],
  ['/notifications', MESSAGES.sync],
  ['/export', MESSAGES.sync],
  ['/settings', MESSAGES.sync],
]
/** Message for the page a route is loading. */
export function messageForPath(pathname = '/') {
  if (pathname === '/' || pathname === '') return MESSAGES.dashboard
  return BY_ROUTE.find(([p]) => pathname === p || pathname.startsWith(p + '/'))?.[1] ?? MESSAGES.sync
}
