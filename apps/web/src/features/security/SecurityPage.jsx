import { PageHeader } from '@/components/shared/PageHeader'
import { Stagger, StaggerItem } from '@/components/motion/primitives'
import { isDevMode } from '@/services/db'
import { AppLockCard } from './AppLockCard'
import { BiometricCard } from './BiometricCard'
import { PasswordCard } from './PasswordCard'
import { SecurityHero } from './SecurityHero'
import { SessionsCard } from './SessionsCard'
import { useSecurity } from './SecurityProvider'

/** Security & Privacy: password, app lock, fingerprint / face unlock, auto-lock, and where you are signed in. */
export default function SecurityPage() {
  const sec = useSecurity()
  return (
    <>
      <PageHeader title="Security & Privacy" description="Control who can open LifeTrack, on this device and on others." />
      <Stagger gap={0.05} className="mx-auto max-w-4xl space-y-4">
        <StaggerItem>
          <SecurityHero state={sec?.state} />
        </StaggerItem>
        {isDevMode && (
          <StaggerItem>
            <p role="note" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
              DEV mode: there is no server here, so the lock is a screen lock for this browser, not protection for the stored data. Connect
              Supabase for the real thing.
            </p>
          </StaggerItem>
        )}
        <StaggerItem>
          <AppLockCard />
        </StaggerItem>
        <StaggerItem>
          <BiometricCard />
        </StaggerItem>
        <StaggerItem>
          <PasswordCard />
        </StaggerItem>
        <StaggerItem>
          <SessionsCard />
        </StaggerItem>
      </Stagger>
    </>
  )
}
