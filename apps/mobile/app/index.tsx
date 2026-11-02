import { Text, View } from 'react-native'
import { addDays } from '@lifetrack/utils'
import { DEFAULTS } from '@lifetrack/constants/schema'
import { dailyScore } from '@lifetrack/core/score'
import { insertSchemas } from '@lifetrack/schemas'
import { theme } from '@lifetrack/design-tokens'
export default function Index() {
  const ok = [addDays('2024-01-01', 1), Object.keys(DEFAULTS).length, typeof dailyScore, Object.keys(insertSchemas).length, theme('dark').primary]
  return <View><Text>{JSON.stringify(ok)}</Text></View>
}
