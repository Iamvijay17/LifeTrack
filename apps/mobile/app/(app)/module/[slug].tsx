import { useLocalSearchParams } from 'expo-router'
import { MODULES } from '../../../src/lib/modules'
import { Screen, Txt } from '../../../src/ui'

export default function ModulePlaceholder() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const m = MODULES.find((x) => x.slug === slug)
  return <Screen><Txt variant="title">{m?.title ?? 'Not found'}</Txt><Txt muted>{m ? 'Coming in Phase 4.' : 'This module does not exist.'}</Txt></Screen>
}
