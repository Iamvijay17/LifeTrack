import { PageHeader } from '@/components/shared/PageHeader'
import { BackupCard } from './BackupCard'
import { CsvCard } from './CsvCard'
import { EraseCard } from './EraseCard'

export default function ExportPage() {
  return (
    <>
      <PageHeader title="Data Export" description="Your data belongs to you: download it, back it up, restore it." />
      <div className="mx-auto max-w-2xl space-y-4">
        <BackupCard />
        <CsvCard />
        <EraseCard />
      </div>
    </>
  )
}
