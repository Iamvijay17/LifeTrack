import { Link } from 'react-router-dom'
import { ChevronDown, Download, Search, Settings } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Stagger, StaggerItem } from '@/components/motion/primitives'
import { Card, CardContent, CardTitle } from '@/components/ui/card'

const QUICK_START = [
  { icon: Search, title: 'Find anything', body: 'Use the search box at the top to jump to any page or find your own tasks, notes and entries.', to: null },
  { icon: Settings, title: 'Make it yours', body: 'Set your theme, timezone, daily targets and score weights in Settings.', to: '/settings' },
  { icon: Download, title: 'Keep a backup', body: 'Download all your data, or restore a backup, from Data Export.', to: '/export' },
]

const FAQ = [
  {
    q: 'Where is everything?',
    a: 'The sidebar groups every module: Productivity (planner, focus, habits, notes), Growth (learning, jobs, goals), Wellness (fitness, health), Money, Insights and System. On a phone, tap More in the bottom bar for the full list.',
  },
  {
    q: 'Is my data private?',
    a: 'Your data is stored against your own account and is only readable by you. You can export or erase it at any time from Data Export.',
  },
  {
    q: 'How do I back up or move my data?',
    a: 'Open Data Export. Download a JSON backup to restore later (even into a different account), or export individual tables as CSV.',
  },
  {
    q: 'How is my daily score worked out?',
    a: 'It blends five areas: Learning, Career, Fitness, Habits, and Sleep & Health. Change how much each one counts under Daily score weights in Settings.',
  },
  {
    q: 'Can I change the theme?',
    a: 'Yes. Open the profile menu (your initial, top right) and choose Light theme or Dark theme, or set it in Settings.',
  },
  {
    q: 'How do I sign out?',
    a: 'Open the profile menu (your initial, top right) and choose Sign out.',
  },
]

export default function HelpPage() {
  return (
    <>
      <PageHeader title="Help & Support" description="Quick answers about getting around LifeTrack." />
      <Stagger gap={0.05} className="mx-auto max-w-2xl space-y-6">
        <StaggerItem>
          <h2 className="lt-eyebrow mb-2">Getting started</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {QUICK_START.map(({ icon: Icon, title, body, to }) => {
              const inner = (
                <CardContent className="space-y-2">
                  <span className="lt-icon-tile h-9 w-9">
                    <Icon className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <CardTitle as="h3">{title}</CardTitle>
                  <p className="text-xs text-muted-foreground">{body}</p>
                </CardContent>
              )
              return to ? (
                <Link key={title} to={to} className="block rounded-lg">
                  <Card interactive className="h-full">
                    {inner}
                  </Card>
                </Link>
              ) : (
                <Card key={title} className="h-full">
                  {inner}
                </Card>
              )
            })}
          </div>
        </StaggerItem>

        <StaggerItem>
          <h2 className="lt-eyebrow mb-2">Frequently asked questions</h2>
          <Card className="divide-y divide-border">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group px-[var(--pad)] py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md text-sm font-medium [&::-webkit-details-marker]:hidden">
                  {q}
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">{a}</p>
              </details>
            ))}
          </Card>
        </StaggerItem>

        <StaggerItem>
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/privacy" className="underline-offset-2 hover:underline">
              Privacy
            </Link>
            {' · '}
            <Link to="/terms" className="underline-offset-2 hover:underline">
              Terms
            </Link>
          </p>
        </StaggerItem>
      </Stagger>
    </>
  )
}
