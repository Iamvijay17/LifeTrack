import { PageHeader } from '@/components/shared/PageHeader'
import { Stagger, StaggerItem } from '@/components/motion/primitives'
import { BackupCard } from './BackupCard'
import { CsvCard } from './CsvCard'
import { EraseCard } from './EraseCard'

export default function ExportPage() {
  return (
    <>
      <PageHeader title="Data Export" description="Your data belongs to you: download it, back it up, restore it." />
      <Stagger gap={0.05} className="mx-auto max-w-2xl space-y-4">
        <StaggerItem>
          <BackupCard />
        </StaggerItem>
        <StaggerItem>
          <CsvCard />
        </StaggerItem>
        <StaggerItem>
          <EraseCard />
        </StaggerItem>
      </Stagger>
    </>
  )
}
