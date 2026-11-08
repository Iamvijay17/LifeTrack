import { Palette } from 'lucide-react'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { Segmented } from '@/components/ui/misc'
import { useAction } from '@/hooks/useAction'
import { useSettings } from '@/hooks/useSettings'
import { applyTheme } from '@/hooks/useTheme'

const THEMES = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
]

export function AppearanceCard() {
  const { settings, save } = useSettings()
  const [setTheme] = useAction(async (theme) => {
    applyTheme(theme) // apply immediately, then persist to the account
    await save({ theme })
  })
  return (
    <SettingsSection icon={Palette} title="Appearance" desc="Follows your account on every device.">
      <Segmented value={settings.theme} onChange={setTheme} options={THEMES} />
    </SettingsSection>
  )
}
