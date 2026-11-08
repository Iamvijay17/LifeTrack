import { useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { SectionLoader } from '@/components/loaders/SectionLoader'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { TypedConfirmDialog } from '@/components/shared/TypedConfirmDialog'
import { Button } from '@/components/ui/button'
import { useAction } from '@/hooks/useAction'
import * as store from '@/hooks/store'
import { db } from '@/services/db'
import { TABLES } from '@lifetrack/constants/schema'

/** Deletes every record (children before parents) but keeps the account and settings. */
export function EraseCard() {
  const [open, setOpen] = useState(false)
  const [erase, erasing] = useAction(
    async () => {
      for (const table of [...TABLES].reverse()) {
        const ids = (await db.list(table)).map((r) => r.id)
        if (ids.length) await store.removeMany(table, ids)
      }
      await store.refetchLoaded()
      setOpen(false)
    },
    { success: 'All your data was erased. Your account and settings are kept.' },
  )
  return (
    <SettingsSection
      icon={AlertTriangle}
      title="Erase all data"
      desc="Deletes every task, habit, note, log and record but keeps your account and settings. This cannot be undone."
    >
      <Button variant="outline" className="border-danger/50 text-danger hover:bg-danger/10" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />
        Erase all data…
      </Button>
      <TypedConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Erase all data?"
        description="Download a JSON backup first if you might want anything back."
        phrase="ERASE"
        confirmLabel="Erase everything"
        pending={erasing}
        onConfirm={() => erase()}
      >
        {erasing && <SectionLoader message="Erasing your data..." minHeight={100} />}
        <p className="mb-3 flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          This applies to every device signed in to your account.
        </p>
      </TypedConfirmDialog>
    </SettingsSection>
  )
}
