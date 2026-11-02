import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useSettings } from '../../../src/hooks/useSettings'
import { useTheme } from '../../../src/providers/ThemeProvider'
import { AccountSection, AppearanceSection, FocusSection, PreferencesSection, ProfileSection, ScoreWeightsSection } from '../../../src/features/settings/parts'
import { ModuleHeader } from '../../../src/ui/ModuleHeader'
import { DataGate } from '../../../src/ui/controls'

export default function Settings() {
  const { colors } = useTheme()
  const { error } = useSettings()
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <ModuleHeader title="Settings" />
        <DataGate loading={false} error={error} onRetry={() => {}}>
          <ProfileSection /><AppearanceSection /><PreferencesSection /><ScoreWeightsSection /><FocusSection /><AccountSection />
        </DataGate>
      </ScrollView>
    </SafeAreaView>
  )
}
