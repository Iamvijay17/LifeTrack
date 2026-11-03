import { Link } from 'react-router-dom'
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

export default function SettingsPage() {
  const { loading, error } = useSettings()
  return (
    <>
      <PageHeader title="Settings" description={isDevMode ? 'DEV mode: stored in this browser only.' : 'Synced to your account.'} />
      <DataGate loading={loading} error={error} cards={0}>
        <div className="mx-auto max-w-2xl space-y-4">
          <ProfileCard />
          <AppearanceCard />
          <PreferencesCard />
          <ScoreWeightsCard />
          <FocusPrefsCard />
          <SettingsSection title="Your data" desc="Exports, backup and restore live on their own page.">
            <Link to="/export" className="text-sm text-secondary underline underline-offset-2">
              Open Data Export →
            </Link>
          </SettingsSection>
          <AccountCard />
        </div>
      </DataGate>
    </>
  )
}
