import { useId } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Database } from 'lucide-react'
import { Stagger, StaggerItem } from '@/components/motion/primitives'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataGate } from '@/components/shared/states'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { useSettings } from '@/hooks/useSettings'
import { isDevMode } from '@/services/db'
import { AccountCard } from './AccountCard'
import { AppearanceCard } from './AppearanceCard'
import { FocusPrefsCard } from './FocusPrefsCard'
import { PreferencesCard } from './PreferencesCard'
import { ProfileCard } from './ProfileCard'
import { ScoreWeightsCard } from './ScoreWeightsCard'
import { SoundCard } from './SoundCard'

/** One labelled group of cards. The label sits in a left rail on wide screens and above the cards on narrow ones. */
function Group({ title, desc, children }) {
  const id = useId()
  return (
    <StaggerItem as="section" aria-labelledby={id} className="grid gap-3 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
      <div className="lg:pt-1">
        <h2 id={id} className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </StaggerItem>
  )
}

const linkClass = '-m-2 inline-block rounded-md p-2 text-sm font-medium text-mod-text underline underline-offset-2'

/** Settings, grouped by how often they are touched: who you are and how the app looks first, account actions last. */
export default function SettingsPage() {
  const { loading, error } = useSettings()
  return (
    <>
      <PageHeader title="Settings" description={isDevMode ? 'DEV mode: stored in this browser only.' : 'Synced to your account.'} />
      <DataGate loading={loading} error={error} cards={0}>
        <Stagger gap={0.04} className="mx-auto max-w-5xl space-y-8">
          <Group title="Profile & appearance" desc="Your name, how LifeTrack looks, and how it sounds and feels.">
            <ProfileCard />
            <AppearanceCard />
            <SoundCard />
          </Group>
          <Group
            title="Region & daily goals"
            desc="Timezone, currency, week start and the targets your daily progress is measured against."
          >
            <PreferencesCard />
          </Group>
          <Group title="Scoring & focus" desc="How the daily score is weighted and how the focus timer paces your breaks.">
            <ScoreWeightsCard />
            <FocusPrefsCard />
          </Group>
          <Group title="Notifications & data" desc="Reminders, exports, backup and restore have their own pages.">
            <div className="grid gap-4 sm:grid-cols-2">
              <SettingsSection headingAs="h3" icon={Bell} title="Notifications" desc="Reminders, alerts and your inbox.">
                <Link to="/notifications" className={linkClass}>
                  Open Notifications →
                </Link>
              </SettingsSection>
              <SettingsSection headingAs="h3" icon={Database} title="Your data" desc="Exports, backup and restore.">
                <Link to="/export" className={linkClass}>
                  Open Data Export →
                </Link>
              </SettingsSection>
            </div>
          </Group>
          <Group title="Account & security" desc="Password, signing out and deleting your account.">
            <AccountCard />
          </Group>
        </Stagger>
      </DataGate>
    </>
  )
}
