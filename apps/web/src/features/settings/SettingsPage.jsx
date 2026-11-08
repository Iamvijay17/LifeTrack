import { Link } from 'react-router-dom'
import { Database } from 'lucide-react'
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

export default function SettingsPage() {
  const { loading, error } = useSettings()
  return (
    <>
      <PageHeader title="Settings" description={isDevMode ? 'DEV mode: stored in this browser only.' : 'Synced to your account.'} />
      <DataGate loading={loading} error={error} cards={0}>
        <Stagger gap={0.04} className="mx-auto max-w-2xl space-y-4">
          <StaggerItem>
            <ProfileCard />
          </StaggerItem>
          <StaggerItem>
            <AppearanceCard />
          </StaggerItem>
          <StaggerItem>
            <PreferencesCard />
          </StaggerItem>
          <StaggerItem>
            <ScoreWeightsCard />
          </StaggerItem>
          <StaggerItem>
            <FocusPrefsCard />
          </StaggerItem>
          <StaggerItem>
            <SettingsSection icon={Database} title="Your data" desc="Exports, backup and restore live on their own page.">
              <Link
                to="/export"
                className="-m-2 inline-block rounded-md p-2 text-sm font-medium text-mod-text underline underline-offset-2"
              >
                Open Data Export →
              </Link>
            </SettingsSection>
          </StaggerItem>
          <StaggerItem>
            <AccountCard />
          </StaggerItem>
        </Stagger>
      </DataGate>
    </>
  )
}
