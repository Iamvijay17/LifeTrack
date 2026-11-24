// Guided tours: where each one runs, and the steps in it. A step points at the page's own elements by CSS selector, trying each in turn and
// using the first that is on screen. If none is (a phone hides the sidebar, a page changed), the step shows centred instead of breaking.
// Nothing here needs a change to the pages themselves.

const SEARCH = ['header a[href="/search"]', 'header button[aria-label*="earch" i]', 'header input']
const HEADER = ['main h1']
const TABS = ['main [role="tablist"]']

export const TOURS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    route: '/',
    steps: [
      {
        target: HEADER,
        title: 'Your day at a glance',
        body: 'The dashboard pulls today from every module: tasks, habits, study, workouts, sleep and spending.',
      },
      {
        target: ['aside nav[aria-label="Main"]', 'nav[aria-label="Mobile"]'],
        title: 'Move between modules',
        body: 'Every module lives here. Pin your favourites and reorder the list in Settings → Appearance.',
      },
      {
        target: SEARCH,
        title: 'Find anything',
        body: 'Search your tasks, notes, goals and more. Press Ctrl/⌘ + K for the command palette from any page.',
      },
      {
        target: ['header button[aria-label="Quick add"]', 'button[aria-label="Quick add"]'],
        title: 'Add something fast',
        body: 'Log a task, expense, workout or note without leaving the page. The palette also creates things: press c, then a letter.',
      },
    ],
  },
  {
    key: 'learning',
    label: 'Career & Learning',
    route: '/learning',
    steps: [
      { target: HEADER, title: 'Career & Learning', body: 'Track what you study, how long, and how it connects to your goals.' },
      { target: TABS, title: 'Switch views', body: 'Overview shows your streak and targets. Topics, Sessions and Goals are one tab away.' },
      {
        target: ['main button:not([role="tab"])'],
        title: 'Log a study session',
        body: 'Start the timer while you study, or add a past session by hand. Your daily target is in Settings.',
      },
    ],
  },
  {
    key: 'fitness',
    label: 'Fitness',
    route: '/fitness',
    steps: [
      { target: HEADER, title: 'Gym & Fitness', body: 'Plan your week, log workouts and watch your progress build.' },
      {
        target: TABS,
        title: 'Plan, log, review',
        body: 'Week shows your plan, Library has the exercise catalog, History and Progress show what you have done.',
      },
      {
        target: ['main button:not([role="tab"])'],
        title: 'Log a workout',
        body: 'Add exercises with sets, reps and weight. Routines let you reuse a session in one tap.',
      },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    route: '/finance',
    steps: [
      { target: HEADER, title: 'Finance', body: 'Income, spending, budgets and savings goals for the month.' },
      {
        target: ['main [aria-label*="onth" i]', 'main h1'],
        title: 'Month by month',
        body: 'Move between months to compare. Budgets reset each month and warn you before you overspend.',
      },
      {
        target: ['main button:not([role="tab"])'],
        title: 'Add a transaction',
        body: 'Record an expense or income. Recurring rules post bills for you on their due date.',
      },
    ],
  },
  {
    key: 'calendar',
    label: 'Calendar',
    route: '/calendar',
    steps: [
      { target: HEADER, title: 'Calendar', body: 'Events, tasks with a time, and reminders on one calendar.' },
      {
        target: ['main [role="tablist"]', 'main button[aria-label*="iew" i]'],
        title: 'Change the view',
        body: 'Month, week, day or agenda. Drag an item to reschedule it. Press ? on this page for its shortcuts.',
      },
      {
        target: ['main button:not([role="tab"])'],
        title: 'Add an event',
        body: 'Pick a time, repeat it, and set a reminder. Right-click an item for more actions.',
      },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    route: '/settings',
    steps: [
      { target: HEADER, title: 'Settings', body: 'Make LifeTrack yours. Everything here follows your account across devices.' },
      {
        target: ['main section'],
        title: 'Look and feel',
        body: 'Theme, accent colour, spacing, motion and which pages sit in your sidebar.',
      },
      { target: ['main'], title: 'Guided tours live here too', body: 'Scroll to "Setup & tours" to finish your setup or replay any tour.' },
    ],
  },
]

export const tourByKey = (key) => TOURS.find((t) => t.key === key)
export const tourForRoute = (pathname) => TOURS.find((t) => t.route === pathname)

/** The first selector that matches an element with a real size on screen, or null. */
export function findTarget(selectors, doc = document) {
  for (const sel of selectors ?? []) {
    let nodes
    try {
      nodes = doc.querySelectorAll(sel)
    } catch {
      continue // a bad selector must never break a tour
    }
    for (const el of nodes) {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) return el
    }
  }
  return null
}

/** Where to put the popover next to a target rect inside a viewport: below it if there is room, else above, else centred. */
export function placePopover(rect, view, size = { w: 320, h: 190 }, gap = 14) {
  const margin = 12
  const w = Math.min(size.w, view.w - margin * 2)
  if (!rect) return { left: (view.w - w) / 2, top: Math.max(margin, (view.h - size.h) / 2), width: w, centred: true }
  const left = Math.max(margin, Math.min(rect.left + rect.width / 2 - w / 2, view.w - w - margin))
  if (rect.bottom + gap + size.h <= view.h - margin) return { left, top: rect.bottom + gap, width: w }
  if (rect.top - gap - size.h >= margin) return { left, top: rect.top - gap - size.h, width: w }
  return { left: (view.w - w) / 2, top: Math.max(margin, view.h - size.h - margin), width: w }
}
