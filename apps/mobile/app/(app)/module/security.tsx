import { ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../../../src/providers/ThemeProvider'
import { AppLockSection, BiometricSection, SessionsSection } from '../../../src/features/security/SecuritySections'
import { ModuleHeader } from '../../../src/ui/ModuleHeader'

/** Security & Privacy: the app lock, fingerprint / face unlock for this phone, and where the account is signed in (the mobile side of the web's /security). */
export default function Security() {
  const { colors } = useTheme()
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <ModuleHeader title="Security & Privacy" />
        <AppLockSection />
        <BiometricSection />
        <SessionsSection />
      </ScrollView>
    </SafeAreaView>
  )
}
