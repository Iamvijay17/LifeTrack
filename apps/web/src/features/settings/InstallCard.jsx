import { Download, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { Button } from '@/components/ui/button'
import { promptInstall, useInstall } from '@/lib/install'

/**
 * Install LifeTrack as an app. Only shown when there is something to do: the browser has an install prompt ready, the phone is an iPhone/iPad
 * (where it is "Add to Home Screen"), or the app is already installed.
 */
export function InstallCard() {
  const { canInstall, installed, ios } = useInstall()
  if (!canInstall && !installed && !ios) return null
  return (
    <SettingsSection
      headingAs="h3"
      icon={Smartphone}
      title="Install LifeTrack"
      desc="Open it from your home screen or dock, full screen, like any other app. It still needs a connection to load and save your data."
    >
      {installed && <p className="text-sm text-muted-foreground">LifeTrack is installed on this device.</p>}
      {canInstall && (
        <Button
          onClick={async () => {
            const outcome = await promptInstall()
            if (outcome === 'accepted') toast.success('LifeTrack is installing')
          }}
        >
          <Download className="h-4 w-4" aria-hidden />
          Install app
        </Button>
      )}
      {ios && (
        <p className="text-sm text-muted-foreground">
          In Safari, tap the Share button, then <b className="text-foreground">Add to Home Screen</b>.
        </p>
      )}
    </SettingsSection>
  )
}
