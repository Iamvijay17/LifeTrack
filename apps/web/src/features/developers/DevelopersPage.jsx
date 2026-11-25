import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/shared/PageHeader'
import { Segmented } from '@/components/ui/misc'
import { ActivityTab } from './ActivityTab'
import { DocsTab } from './DocsTab'
import { KeysTab } from './KeysTab'
import { UnavailableState, platformAvailable } from './shared'
import { WebhooksTab } from './WebhooksTab'

const TABS = [
  { value: 'keys', label: 'API keys' },
  { value: 'activity', label: 'Activity' },
  { value: 'webhooks', label: 'Webhooks' },
  { value: 'docs', label: 'Documentation' },
]

export default function DevelopersPage() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'keys'
  const available = platformAvailable()
  return (
    <>
      <PageHeader
        title="Developers"
        description="API keys, webhooks and documentation, so your own tools can work with your LifeTrack data."
      />
      <div className="mb-4 overflow-x-auto print:hidden">
        <Segmented
          aria-label="Developer section"
          value={tab}
          onChange={(v) => setParams(v === 'keys' ? {} : { tab: v }, { replace: true })}
          options={TABS}
        />
      </div>
      {tab === 'docs' ? (
        <DocsTab />
      ) : !available ? (
        <UnavailableState />
      ) : tab === 'keys' ? (
        <KeysTab />
      ) : tab === 'activity' ? (
        <ActivityTab />
      ) : (
        <WebhooksTab />
      )}
    </>
  )
}
