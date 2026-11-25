import { Fragment } from 'react'
import { ModuleHeader } from '../../src/ui/ModuleHeader'
import { Card, Screen, Txt } from '../../src/ui'

const SECTIONS = [
  {
    title: 'Getting around',
    items: [
      { q: 'Where is everything?', a: 'The tab bar has your daily essentials: Today, Planner, Habits and Finance. Tap More for every other module, Settings and your account.' },
      { q: 'How do I get started?', a: 'Open More, then Settings, and set your timezone, currency and daily targets. Then add a task in Planner and a habit, and log water or a meal. Today fills in as you go.' },
      { q: 'What can I do on the phone?', a: 'Planner, Habits, Finance, Focus, Learning, Jobs, Goals, Notes, Fitness, Health, Food, Analytics, Notifications and Settings are all in the app. Everything you log shows up in the web app too, because both use the same account.' },
      { q: 'How do I sign out?', a: 'Open More and tap Sign out at the bottom.' },
    ],
  },
  {
    title: 'Your score and goals',
    items: [
      { q: 'How is my daily score worked out?', a: 'It blends Learning, Career, Fitness, Habits, and Sleep & Health. Only the areas that apply to your day count, so a rest day is not penalised. Change how much each counts under Score weights in Settings.' },
      { q: 'How do habit streaks work?', a: 'A streak counts consecutive days you completed a habit on the days it is scheduled. Days you mark as skipped or rest do not break it.' },
      { q: 'Why is my score low early in the day?', a: 'The score compares what you have done so far with what is planned for today, so it rises as you complete tasks, habits and logs.' },
    ],
  },
  {
    title: 'Your data',
    items: [
      { q: 'Is my data private?', a: 'Your data is stored against your own account and is only readable by you.' },
      { q: 'How do I back up my data?', a: 'Use Data Export on the web app: download a JSON backup, or export tables as CSV. A backup can be restored into any account and never deletes what is already there.' },
      { q: 'My changes are not showing on another device.', a: 'Both devices must be signed in to the same account. Reopen the app, or refresh the web page, to fetch the latest data. Account & sync check in More shows which account you are signed in to.' },
    ],
  },
  {
    title: 'Reminders',
    items: [
      { q: 'Why did my reminder not go off?', a: 'Reminders fire while LifeTrack is open on any of your devices. If it was closed, the reminder waits in your Notifications inbox. Also check that its type is switched on under Preferences in Notifications.' },
    ],
  },
  {
    title: 'Troubleshooting',
    items: [
      { q: 'Dates or times look wrong.', a: 'LifeTrack uses the timezone saved in Settings to decide what “today” is. Set it to where you are.' },
      { q: 'A screen will not load.', a: 'Check your internet connection and reopen the app. If it keeps happening, sign out from More, sign back in, and try again.' },
    ],
  },
]

export default function Help() {
  return (
    <Screen>
      <ModuleHeader title="Help & Support" />
      {SECTIONS.map(({ title, items }) => (
        <Fragment key={title}>
          <Txt variant="small" muted>{title.toUpperCase()}</Txt>
          {items.map(({ q, a }) => (
            <Card key={q}>
              <Txt variant="heading">{q}</Txt>
              <Txt variant="small" muted>{a}</Txt>
            </Card>
          ))}
        </Fragment>
      ))}
    </Screen>
  )
}
