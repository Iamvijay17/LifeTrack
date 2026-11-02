import { useRef, useState } from 'react'
import { FileJson, Upload } from 'lucide-react'
import { SectionLoader } from '@/components/loaders/SectionLoader'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/misc'
import { useAction } from '@/hooks/useAction'
import { buildExport, importBackup, parseBackup, summarizeBackup } from '@/services/backup'
import { download } from '@/services/csv'

/** Full JSON backup, and restore (a merge by id: restoring never deletes anything that already exists). */
export function BackupCard() {
  const file = useRef(null)
  const [pending, setPending] = useState(null) // a parsed backup waiting for confirmation
  const [progress, setProgress] = useState(null)

  const [exportAll, exporting] = useAction(
    async () => {
      const data = await buildExport()
      download(`lifetrack-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json')
    },
    { success: 'Backup downloaded' },
  )
  const [pick] = useAction(async (f) => {
    setPending({ ...parseBackup(await f.text()), name: f.name })
  })
  const [restore, restoring] = useAction(
    async () => {
      setProgress({ done: 0, total: 1 })
      try {
        await importBackup(pending, (done, total) => setProgress({ done, total }))
      } finally {
        setProgress(null)
      }
      setPending(null)
    },
    { success: 'Backup restored' },
  )

  return (
    <SettingsSection
      title="Your data"
      desc="Export everything any time. Restoring merges into this account and never deletes existing data."
    >
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={exportAll} loading={exporting}>
          <FileJson className="h-4 w-4" />
          Export JSON backup
        </Button>
        <Button variant="outline" onClick={() => file.current?.click()}>
          <Upload className="h-4 w-4" />
          Restore from JSON…
        </Button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          data-testid="import-file"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) pick(f)
          }}
        />
      </div>
      <Dialog
        open={!!pending}
        onOpenChange={(o) => !o && !restoring && setPending(null)}
        title="Restore backup?"
        description={pending && `${pending.name} · exported ${new Date(pending.exported_at).toLocaleString()}`}
        footer={
          <>
            <Button variant="outline" disabled={restoring} onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button onClick={restore} loading={restoring}>
              Restore
            </Button>
          </>
        }
      >
        {pending && (
          <div className="space-y-3 text-sm">
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
              {summarizeBackup(pending).map((s) => (
                <li key={s.table} className="flex justify-between">
                  <span className="text-muted-foreground">{s.table}</span>
                  <b>{s.count}</b>
                </li>
              ))}
            </ul>
            {restoring && <SectionLoader message="Restoring your data..." minHeight={120} />}
            {progress && <Progress value={(progress.done / progress.total) * 100} label="Import progress" />}
            <p className="text-xs text-muted-foreground">Records are merged by ID into your account. Existing data is kept.</p>
          </div>
        )}
      </Dialog>
    </SettingsSection>
  )
}
