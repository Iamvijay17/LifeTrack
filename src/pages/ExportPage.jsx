import { useRef, useState } from 'react'
import { AlertTriangle, Download, FileJson, Trash2, Upload } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/form'
import { Dialog } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/misc'
import { SectionLoader } from '@/components/loaders/SectionLoader'
import { useAction } from '@/hooks/useAction'
import { useConfirm } from '@/components/shared/Confirm'
import { buildExport, importBackup, parseBackup, summarizeBackup } from '@/services/backup'
import { download, toCsv, tableToCsv, EXPORTABLE } from '@/services/csv'
import * as store from '@/hooks/store'
import { db } from '@/services/db'
import { TABLES } from '@/services/schema'

function Section({ title, desc, children }) {
  return <Card><CardHeader className="flex-col items-start gap-0.5"><CardTitle>{title}</CardTitle>{desc && <p className="text-xs text-muted-foreground">{desc}</p>}</CardHeader><CardContent className="space-y-4">{children}</CardContent></Card>
}

function BackupCard() {
  const confirm = useConfirm()
  const file = useRef(null)
  const [pending, setPending] = useState(null) // parsed backup awaiting confirmation
  const [prog, setProg] = useState(null)
  const [exportAll, exporting] = useAction(async () => {
    const data = await buildExport()
    download(`lifetrack-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json')
  }, { success: 'Backup downloaded' })
  const [pick] = useAction(async (f) => { setPending({ ...parseBackup(await f.text()), name: f.name }) })
  const [restore, restoring] = useAction(async () => {
    setProg({ done: 0, total: 1 })
    try { await importBackup(pending, (done, total) => setProg({ done, total })) } finally { setProg(null) }
    setPending(null)
  }, { success: 'Backup restored' })
  return (
    <Section title="Your data" desc="Export everything any time. Restoring merges into this account and never deletes existing data.">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={exportAll} loading={exporting}><FileJson className="h-4 w-4" />Export JSON backup</Button>
        <Button variant="outline" onClick={() => file.current?.click()}><Upload className="h-4 w-4" />Restore from JSON…</Button>
        <input ref={file} type="file" accept="application/json,.json" hidden data-testid="import-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pick(f) }} />
      </div>
      <Dialog open={!!pending} onOpenChange={(o) => !o && !restoring && setPending(null)} title="Restore backup?" description={pending && `${pending.name} · exported ${new Date(pending.exported_at).toLocaleString()}`}
        footer={<><Button variant="outline" disabled={restoring} onClick={() => setPending(null)}>Cancel</Button><Button onClick={restore} loading={restoring}>Restore</Button></>}>
        {pending && <div className="space-y-3 text-sm"><ul className="grid grid-cols-2 gap-x-4 gap-y-1">{summarizeBackup(pending).map((s) => <li key={s.table} className="flex justify-between"><span className="text-muted-foreground">{s.table}</span><b>{s.count}</b></li>)}</ul>
          {restoring && <SectionLoader message="Restoring your data..." minHeight={120} />}
          {prog && <Progress value={(prog.done / prog.total) * 100} label="Import progress" />}
          <p className="text-xs text-muted-foreground">Records are merged by ID into your account. Existing data is kept.</p></div>}
      </Dialog>
    </Section>
  )
}


function CsvCard() {
  const [exportTable, busy] = useAction(async (t) => {
    const csv = await tableToCsv(t)
    if (!csv) throw new Error('Nothing to export yet.')
    download(`lifetrack-${t}.csv`, csv)
  })
  return (
    <Section title="Export to CSV" desc="One spreadsheet-ready file per module. Reports can be exported from the Reports page.">
      <div className="flex flex-wrap gap-2">{EXPORTABLE.map(([t, label]) => <Button key={t} variant="outline" size="sm" disabled={busy} onClick={() => exportTable(t)}><Download className="h-3.5 w-3.5" />{label}</Button>)}</div>
    </Section>
  )
}

function EraseCard() {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [erase, erasing] = useAction(async () => {
    for (const t of [...TABLES].reverse()) {
      const ids = (await db.list(t)).map((r) => r.id)
      if (ids.length) await store.removeMany(t, ids)
    }
    await store.refetchLoaded()
    setOpen(false)
  }, { success: 'All your data was erased. Your account and settings are kept.' })
  return (
    <Section title="Erase all data" desc="Deletes every task, habit, note, log and record but keeps your account and settings. This cannot be undone.">
      <Button variant="outline" className="border-danger/50 text-danger hover:bg-danger/10" onClick={() => { setTyped(''); setOpen(true) }}><Trash2 className="h-4 w-4" />Erase all data…</Button>
      <Dialog open={open} onOpenChange={(o) => !erasing && setOpen(o)} title="Erase all data?" description="Download a JSON backup first if you might want anything back."
        footer={<><Button variant="outline" disabled={erasing} onClick={() => setOpen(false)}>Cancel</Button><Button variant="destructive" loading={erasing} disabled={typed !== 'ERASE'} onClick={() => erase()}>Erase everything</Button></>}>
        {erasing && <SectionLoader message="Erasing your data..." minHeight={100} />}
        <div className="space-y-3"><p className="flex items-start gap-2 text-sm text-muted-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />This applies to every device signed in to your account.</p>
          <Field label="Type ERASE to confirm"><Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></Field></div>
      </Dialog>
    </Section>
  )
}

export default function ExportPage() {
  return (
    <>
      <PageHeader title="Data Export" description="Your data belongs to you: download it, back it up, restore it." />
      <div className="mx-auto max-w-2xl space-y-4"><BackupCard /><CsvCard /><EraseCard /></div>
    </>
  )
}
