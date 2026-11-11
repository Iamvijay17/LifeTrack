import { PageHeader } from '@/components/shared/PageHeader'
import { Stagger, StaggerItem } from '@/components/motion/primitives'
import { Lock } from 'lucide-react'
import { listModules } from '@lifetrack/core/moduleLocks'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useModuleLocks } from '@/features/security/useModuleLocks'
import { BackupCard } from './BackupCard'
import { CsvCard } from './CsvCard'
import { EraseCard } from './EraseCard'

export default function ExportPage() {
  const { closed, unlock } = useModuleLocks()
  // A backup, export or erase made while a module is locked would silently skip it (the database shows a locked session nothing from it).
  if (closed.length > 0)
    return (
      <>
        <PageHeader title="Data Export" description="Your data belongs to you: download it, back it up, restore it." />
        <Card className="mx-auto max-w-2xl" data-testid="export-locked">
          <CardContent className="flex flex-col items-start gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Lock className="h-4 w-4" aria-hidden /> Unlock first
            </p>
            <p className="text-sm text-muted-foreground">
              {listModules(closed)} {closed.length === 1 ? 'is' : 'are'} locked. A backup, export or erase made now would leave{' '}
              {closed.length === 1 ? 'it' : 'them'} out, so this page opens once everything is unlocked.
            </p>
            <Button onClick={() => unlock('*')}>Unlock</Button>
          </CardContent>
        </Card>
      </>
    )
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
