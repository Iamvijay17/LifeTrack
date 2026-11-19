import { useRef, useState } from 'react'
import { FileJson, Upload } from 'lucide-react'
import { SectionLoader } from '@/components/loaders/SectionLoader'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/misc'
import { useAction } from '@/hooks/useAction'
import { useToday } from '@/hooks/useToday'
import { AppError } from '@/services/errors'
import { buildExport, importBackup, MAX_BACKUP_BYTES, parseBackup, summarizeBackup } from '@/services/backup'
import { download } from '@/services/csv'

// When the backup was made, as the person reads it; a hand-edited or missing date says so instead of "Invalid Date".
const exportedAt = (v) => {
  const d = v ? new Date(v) : null
  return d && Number.isFinite(d.getTime()) ? `exported ${d.toLocaleString()}` : 'export date unknown'
}

/** Full JSON backup, and restore (a merge by id: restoring never deletes anything that already exists). */
export function BackupCard() {
  const file = useRef(null)
  const [pending, setPending] = useState(null) // a parsed backup waiting for confirmation
  const [progress, setProgress] = useState(null)
  const today = useToday() // the file is named after the day in the person's time zone, not the UTC date

  const [exportAll, exporting] = useAction(
    async () => {
      const data = await buildExport()
      download(`lifetrack-backup-${today}.json`, JSON.stringify(data, null, 2), 'application/json')
    },
    { success: 'Backup downloaded' },
  )
  const [pick] = useAction(async (f) => {
    // Checked before reading: a huge file would otherwise be read into memory whole (and freeze the tab) only to be refused.
    if (f.size > MAX_BACKUP_BYTES) throw new AppError('That backup file is too large.')
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
      icon={FileJson}
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
        description={pending && `${pending.name} · ${exportedAt(pending.exported_at)}`}
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
