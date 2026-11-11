/**
 * Everything the Help page says, kept apart from the page so it is easy to extend and to test.
 * `module` ties a guide to a sidebar entry (see lib/nav.js), which supplies its icon, name and link.
 */

export const QUICK_START = [
  {
    id: 'search',
    title: 'Find anything',
    body: 'Press ⌘ K (Ctrl K on Windows) or use the search box at the top to jump to any page, or to find your own tasks, notes and entries.',
    to: null,
  },
  {
    id: 'quick-add',
    title: 'Add in one tap',
    body: 'The Quick add button at the top opens a menu: a task, study session, workout, expense, water, a habit check-in or a job application, from any page.',
    to: null,
  },
  {
    id: 'dashboard',
    title: 'Shape your dashboard',
    body: 'Use Customize on the Dashboard to choose which widgets show and drag them into your order. It is saved to your account.',
    to: '/',
  },
  {
    id: 'settings',
    title: 'Make it yours',
    body: 'Set your theme, timezone, currency, daily targets and score weights in Settings.',
    to: '/settings',
  },
  {
    id: 'reminders',
    title: 'Never miss a thing',
    body: 'Create reminders for tasks, study, workouts, habits and bills. The bell opens your inbox, where you can snooze, dismiss or search what you have been told.',
    to: '/notifications',
  },
  {
    id: 'backup',
    title: 'Keep a backup',
    body: 'Download all your data, or restore a backup, from Data Export. Do it before big changes.',
    to: '/export',
  },
]

export const GUIDES = [
  {
    module: 'dashboard',
    summary: 'Your day at a glance: today’s score, priorities, upcoming items, goals, spending and food.',
    steps: [
      'Open the Dashboard to see everything due today and your daily score.',
      'Choose Customize to switch widgets on or off and drag them into the order you like.',
      'Use the quick actions to add a task, log water or start studying without leaving the page.',
    ],
    tips: ['The first-run “Getting started” checklist ticks itself off as you add real data, and goes away once complete or dismissed.'],
  },
  {
    module: 'planner',
    summary: 'Plan each day with tasks, priorities and due dates.',
    steps: [
      'Pick a day with the date picker, then add a task with a title, category, priority and optional due date.',
      'Tick a task to complete it. You can also mark it skipped or cancelled if the plan changed.',
      'Tasks you did not finish appear under Overdue, and tasks with no date sit in their own list so nothing gets lost.',
    ],
    tips: [
      'Your top priorities are pulled to the top of the day.',
      'Tasks also count toward your daily score, based on their category (Learning, Gym, Health and so on).',
    ],
  },
  {
    module: 'calendar',
    summary: 'One calendar for your tasks, events, interviews, reminders and deadlines. Day, week, month and agenda views.',
    steps: [
      'Click an empty slot (or press N) to add an event or a task. Tasks you add here are the same tasks you see in the Planner.',
      'Drag anything to another day or time, or drag its top or bottom edge to change how long it lasts. Every change is saved straight away.',
      'Drag a task from Unscheduled onto a day or a time slot to plan it.',
      'Repeat an event daily, weekly, monthly, yearly or on your own schedule. When you change one that repeats, choose this event, this and following, or all events.',
      'Add alerts to an event or task. They appear in your notifications, and as a browser notification if you turn that on in Calendar settings.',
    ],
    tips: [
      'Keys: T today, D / W / M / A switch view, J and K (or the arrow keys) move back and forward, N new, / search, G go to a date, ? all shortcuts.',
      'Interviews, reminders, goal deadlines, follow-ups, bills and revision dates show up on their own. Interviews and reminders can be dragged too; the rest open their page.',
      'On a phone, press and hold an item for a moment, then drag it. Tap a day in Month view to see its schedule.',
    ],
  },
  {
    module: 'focus',
    summary: 'A Pomodoro-style timer. Every finished block is saved to your account.',
    steps: [
      'Choose Focus or a break, pick a preset length or enter a custom number of minutes.',
      'Optionally add a label for what you are working on.',
      'Start the timer. When a block ends you will hear a chime and the session is logged.',
    ],
    tips: [
      'Break lengths and how often you get a long break are set under Focus in Settings.',
      'Your focus history and daily totals appear on the same page.',
    ],
  },
  {
    module: 'habits',
    summary: 'Build streaks with a one-tap daily check-in.',
    steps: [
      'Create a habit that repeats daily, weekly or on specific days of the week.',
      'Check it in from the Habits page or from Quick add.',
      'Mark a day as skipped or rest day when life gets in the way, so it does not break your streak.',
    ],
    tips: [
      'Open a habit to see its streak, best streak and consistency over time.',
      'Habits that are scheduled today count toward your daily score.',
    ],
  },
  {
    module: 'notes',
    summary: 'Private notes and a daily journal, written in Markdown.',
    steps: [
      'Create a note with a title, text, and tags. Use Markdown for headings, lists, bold and links.',
      'Switch to Daily journal to write one entry per day.',
      'Attach a note to a goal or a task to keep context together.',
    ],
    tips: ['Search (⌘ K) also looks inside your notes.'],
  },
  {
    module: 'learning',
    summary: 'Track real study time, topics and DSA practice against your goals.',
    steps: [
      'Add study goals and the topics you are working through.',
      'Start the study timer, or log a session by hand with its length and what you covered.',
      'Use the Overview tab to see time studied against your daily target.',
    ],
    tips: [
      'Your daily study target is set in Settings and feeds the Learning part of your score.',
      'The Sessions tab keeps a full history you can edit or clean up.',
    ],
  },
  {
    module: 'jobs',
    summary: 'Every application, interview and status change in one place.',
    steps: [
      'Add an application with the company, role, link and expected salary (in LPA).',
      'Drag it across the board (or use Move) as it progresses. Each change is recorded in its status history.',
      'Schedule interviews and tick off the prep checklist for each application.',
    ],
    tips: [
      'Switch between the board and the table, and use search and filters to narrow things down.',
      'The interview calendar and reminders show what is coming up next.',
    ],
  },
  {
    module: 'goals',
    summary: 'Goals from daily to yearly, broken into milestones.',
    steps: [
      'Create a goal, choose its time horizon and an optional due date.',
      'Add milestones and tick them off as you go; progress updates automatically.',
      'Finished or archived goals move to the History tab.',
    ],
    tips: ['Link notes to a goal to keep your thinking next to the target.'],
  },
  {
    module: 'fitness',
    summary: 'Plan your week, log sets and see your progress.',
    steps: [
      'Build routines from the exercise library, with start and end photos for each exercise.',
      'Place routines on your weekly plan, then log the workout with sets, reps and weight.',
      'Record weight and body measurements in the Body tab.',
    ],
    tips: [
      'The Progress tab charts any exercise by top weight, volume or top reps over time.',
      'Rest days and skipped workouts are not penalised in your daily score.',
    ],
  },
  {
    module: 'health',
    summary: 'Log sleep, water, steps and more, once a day.',
    steps: [
      'Open the daily log and enter your sleep, water and steps.',
      'Sleep is saved under the date you woke up, so a night that crosses midnight lands on the right day.',
      'Browse history and charts to spot patterns.',
    ],
    tips: ['Your sleep and water goals are set in Settings and feed the Sleep & Health part of your score.'],
  },
  {
    module: 'nutrition',
    summary: 'Calories, macros and water, with Indian starter foods you can edit.',
    steps: [
      'On Today, add food to a meal by searching the food list, then pick a serving size and quantity.',
      'Tap a recent food in Quick add to log it again in one tap.',
      'Log water with the preset buttons or a custom amount.',
    ],
    tips: [
      'Set your daily calorie and macro targets from the Daily targets button.',
      'The Foods tab lets you add your own foods; Calendar and Analytics show how you have eaten over time.',
      'Many foods can also be found by their Tamil names.',
    ],
  },
  {
    module: 'finance',
    summary: 'Income, spending, budgets and savings for each month.',
    steps: [
      'Add income and expenses with a category and date; move between months with the month picker.',
      'Set a monthly budget. You will see an alert as you approach or pass it.',
      'Create recurring rules for bills and salary, and savings goals to put money towards.',
    ],
    tips: ['Choose your currency in Settings.', 'The default monthly budget in Settings applies to any month you have not set your own.'],
  },
  {
    module: 'analytics',
    summary: 'Trends across everything you track.',
    steps: [
      'Pick a date range at the top of the page.',
      'Scroll through sections for habits, learning, jobs, fitness, health and finance.',
    ],
    tips: ['Analytics only shows what you have logged, so a quiet chart usually means a quiet week.'],
  },
  {
    module: 'reports',
    summary: 'Summaries of any period, ready to print or export.',
    steps: ['Choose a date range to see totals, charts and a day-by-day activity table.', 'Print the page, or export the report as CSV.'],
    tips: ['Reports are handy for weekly or monthly reviews.'],
  },
  {
    module: 'notifications',
    summary: 'Reminders, alerts, nudges from your other modules, and one inbox for all of them.',
    steps: [
      'Open Reminders and add one: choose a type, a priority, a date and time, and how often it repeats.',
      'When it is due, it lands in your Inbox and the bell in the top bar shows an unread count. Click the bell for the drawer.',
      'On a notification, Snooze it, Dismiss it (it moves to History, and you can Undo) or mark it read or unread. Search and filter by category and priority.',
      'Use Preferences for quiet hours, desktop notifications, the times of the daily summaries, and to turn off categories you do not want.',
    ],
    tips: [
      'Reminders fire while LifeTrack is open on any of your devices, and from the server to the phone app. Summaries from your other modules need an open app.',
      'Urgent reminders come through quiet hours; everything else waits in your inbox and is summed up when they end.',
    ],
  },
  {
    module: 'settings',
    summary: 'Your profile, appearance, targets and account.',
    steps: [
      'Set your name, theme, timezone, currency and the day your week starts.',
      'Set targets for study, sleep, water, steps and your monthly budget.',
      'Adjust how much each area counts toward your daily score, and your focus break lengths.',
    ],
    tips: ['Changing your timezone changes what “today” means across the app.'],
  },
  {
    module: 'export',
    summary: 'Download, back up, restore or erase your data.',
    steps: [
      'Download a JSON backup of everything, or export individual tables as CSV.',
      'To restore, choose a backup file. It is merged into this account and never deletes what you already have.',
      'Erase all data clears your records but keeps your account and settings.',
    ],
    tips: ['A JSON backup can be restored into a different account, which is how you move your data.'],
  },
]

export const FAQ_CATEGORIES = ['All', 'Basics', 'Data & privacy', 'Score & goals', 'Reminders', 'Troubleshooting']

export const FAQ = [
  {
    cat: 'Basics',
    q: 'Where is everything?',
    a: 'The sidebar groups every module: Productivity (planner, focus, habits, notes), Growth (learning, jobs, goals), Wellness (fitness, health, food), Money, Insights and System. On a phone, tap More in the bottom bar for the full list.',
  },
  {
    cat: 'Basics',
    q: 'How do I get started?',
    a: 'Open Settings and set your timezone, currency and daily targets. Then add a task in the Daily Planner and a habit, and log water or a meal. The Dashboard fills in as you go.',
  },
  {
    cat: 'Basics',
    q: 'Can I change the theme?',
    a: 'Yes. Open the profile menu (your initial, top right) and choose Light theme or Dark theme, or set it in Settings.',
  },
  {
    cat: 'Basics',
    q: 'How do I change what shows on the Dashboard?',
    a: 'Open the Dashboard and choose Customize. Switch widgets on or off and drag them into the order you want. The layout is saved to your account and follows you to other devices.',
  },
  {
    cat: 'Basics',
    q: 'Can I use LifeTrack on my phone?',
    a: 'Yes. The web app works on any phone browser, and there is a LifeTrack mobile app too. Both read and write the same account, so what you log in one shows up in the other.',
  },
  {
    cat: 'Basics',
    q: 'How do I sign out?',
    a: 'Open the profile menu (your initial, top right) and choose Sign out.',
  },
  {
    cat: 'Data & privacy',
    q: 'Is my data private?',
    a: 'Your data is stored against your own account and is only readable by you. You can export or erase it at any time from Data Export.',
  },
  {
    cat: 'Data & privacy',
    q: 'How do I back up or move my data?',
    a: 'Open Data Export. Download a JSON backup to restore later (even into a different account), or export individual tables as CSV for a spreadsheet.',
  },
  {
    cat: 'Data & privacy',
    q: 'What happens when I restore a backup?',
    a: 'The backup is merged into your account. Nothing you already have is deleted, so restoring is safe to try.',
  },
  {
    cat: 'Data & privacy',
    q: 'How do I delete everything?',
    a: 'Open Data Export and choose Erase all data. You will be asked to type a confirmation word first. It clears every record on all your devices but keeps your account and settings. It cannot be undone, so download a backup first.',
  },
  {
    cat: 'Data & privacy',
    q: 'Can I change my password?',
    a: 'Yes. Open Settings and use the Account section to set a new password.',
  },
  {
    cat: 'Score & goals',
    q: 'How is my daily score worked out?',
    a: 'It blends five areas: Learning, Career, Fitness, Habits, and Sleep & Health. Only the areas that apply to your day count, so a rest day is not penalised. Change how much each one counts under Daily score weights in Settings.',
  },
  {
    cat: 'Score & goals',
    q: 'What counts towards each part of the score?',
    a: 'Learning: study time against your daily target plus Learning tasks. Career: Job Search tasks, applications sent and interviews done. Fitness: your planned workout and steps. Habits: habits scheduled today plus Personal and Finance tasks. Sleep & Health: sleep and water against your goals.',
  },
  {
    cat: 'Score & goals',
    q: 'How do habit streaks work?',
    a: 'A streak counts consecutive days you completed a habit on the days it is scheduled. Days you mark as skipped or rest do not break it. Weekly habits count weeks in which you reached your target.',
  },
  {
    cat: 'Score & goals',
    q: 'Why is my score low early in the day?',
    a: 'The score compares what you have done so far with what is planned for today, so it rises as you complete tasks, habits and logs through the day.',
  },
  {
    cat: 'Reminders',
    q: 'Why did my reminder not go off?',
    a: 'Reminders fire while LifeTrack is open in a browser or the app, on any of your devices. If it is closed, you will see the reminder in your Inbox the next time you open it, marked as missed with the time it was due. Also check that the reminder’s type is switched on under Preferences in Notifications, and that quiet hours are not holding the pop-up (the notification is still in your Inbox).',
  },
  {
    cat: 'Reminders',
    q: 'Can reminders repeat?',
    a: 'Yes. Choose daily, weekly or monthly when you create the reminder. A monthly reminder set for the 31st falls on the last day of shorter months.',
  },
  {
    cat: 'Troubleshooting',
    q: 'My changes are not showing on another device.',
    a: 'Both devices must be signed in to the same account. Refresh the page, or reopen the app, to fetch the latest data.',
  },
  {
    cat: 'Troubleshooting',
    q: 'The timer or reminder time looks wrong.',
    a: 'LifeTrack uses the timezone saved in Settings to decide what “today” is. Set it to where you are, and the dates and times will follow.',
  },
  {
    cat: 'Troubleshooting',
    q: 'I cannot find something I added.',
    a: 'Use search (⌘ K or Ctrl K) to look across your tasks, notes and entries. Also check that the date, month or filter at the top of the page is set to when you added it.',
  },
  {
    cat: 'Troubleshooting',
    q: 'A page failed to load.',
    a: 'Check your internet connection and use Try again on the page. If it keeps happening, sign out, sign back in and reload.',
  },
]

export const SHORTCUTS = [
  { keys: ['⌘ K', 'Ctrl K'], label: 'Open search and jump to any page or item' },
  { keys: ['↑', '↓'], label: 'Move through search results' },
  { keys: ['Enter'], label: 'Open the highlighted search result' },
  { keys: ['Esc'], label: 'Close a dialog or the search box' },
  { keys: ['←', '→'], label: 'Switch between tabs when a tab bar is focused' },
  { keys: ['Home', 'End'], label: 'Jump to the first or last tab' },
]

/** Plain-text haystack for the help search box. */
export const textOf = (...parts) => parts.flat(Infinity).filter(Boolean).join(' ').toLowerCase()

/** True when every word of the query appears somewhere in the text. */
export const matches = (query, text) => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return words.every((w) => text.includes(w))
}
