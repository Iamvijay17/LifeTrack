import { ModuleHeader } from '../../src/ui/ModuleHeader'
import { Card, Screen, Txt } from '../../src/ui'

const FAQ = [
  { q: 'Where is everything?', a: 'The tab bar has your daily essentials. Tap More for every module, Settings and your account.' },
  { q: 'Is my data private?', a: 'Your data is stored against your own account and is only readable by you.' },
  { q: 'How is my daily score worked out?', a: 'It blends Learning, Career, Fitness, Habits, and Sleep & Health. Change how much each counts under Score weights in Settings.' },
  { q: 'How do I back up my data?', a: 'Use Data Export on the web app: download a JSON backup, or export tables as CSV.' },
  { q: 'How do I sign out?', a: 'Open More and tap Sign out at the bottom.' },
]

export default function Help() {
  return (
    <Screen>
      <ModuleHeader title="Help & Support" />
      {FAQ.map(({ q, a }) => (
        <Card key={q}>
          <Txt variant="heading">{q}</Txt>
          <Txt variant="small" muted>{a}</Txt>
        </Card>
      ))}
    </Screen>
  )
}
