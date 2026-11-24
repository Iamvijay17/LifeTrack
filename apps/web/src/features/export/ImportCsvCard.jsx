import { useRef, useState } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useAction } from '@/hooks/useAction'
import { useSettings } from '@/hooks/useSettings'
import { formatMoney } from '@/lib/money'
import { plural } from '@/lib/format'
import { MAX_CSV_BYTES, analyzeTransactionsCsv, importTransactions } from '@/services/csvImport'
import { AppError } from '@/services/errors'
import { db } from '@/services/db'

/** Import transactions from a CSV (the same layout as the export). A preview comes first: new, already-there and invalid rows are counted and nothing is written until the person agrees. */
export function ImportCsvCard() {
  const file = useRef(null)
  const { settings } = useSettings()
  const [preview, setPreview] = useState(null)
  const [pick, picking] = useAction(async (f) => {
    if (f.size > MAX_CSV_BYTES) throw new AppError('That file is too large (5 MB at most).')
    const existing = await db.list('transactions') // read straight from the database, so duplicates are judged against everything saved
    setPreview({ ...analyzeTransactionsCsv(await f.text(), existing), name: f.name })
  })
  const [run, importing] = useAction(
    async () => {
      await importTransactions(preview.fresh)
      setPreview(null)
    },
    { success: () => `${plural(preview?.fresh.length ?? 0, 'transaction')} imported` },
  )
  return (
    <SettingsSection
      icon={FileSpreadsheet}
      title="Import transactions from CSV"
      desc="Use the same columns as the export: Date, Type, Category, Payment method, Amount, Note. You see a preview first."
    >
      <Button variant="outline" loading={picking} onClick={() => file.current?.click()}>
        <Upload className="h-4 w-4" aria-hidden /> Choose a CSV file…
      </Button>
      <input
        ref={file}
        type="file"
        accept=".csv,text/csv"
        hidden
        data-testid="import-csv-file"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) pick(f)
        }}
      />
      <Dialog
        open={!!preview}
        onOpenChange={(o) => !o && !importing && setPreview(null)}
        title="Import preview"
        description={preview && `${preview.name} · ${plural(preview.total, 'row')}`}
        footer={
          <>
            <Button variant="outline" disabled={importing} onClick={() => setPreview(null)}>
              Cancel
            </Button>
            <Button onClick={run} loading={importing} disabled={!preview?.fresh.length}>
              Import {preview ? plural(preview.fresh.length, 'transaction') : ''}
            </Button>
          </>
        }
      >
        {preview && (
          <div className="space-y-4 text-sm" data-testid="csv-preview">
            <ul className="grid grid-cols-3 gap-2 text-center">
              {[
                ['New', preview.fresh.length, 'text-success'],
                ['Already saved', preview.duplicates.length, 'text-muted-foreground'],
                ['Invalid', preview.errors.length, preview.errors.length ? 'text-danger' : 'text-muted-foreground'],
              ].map(([label, n, tone]) => (
                <li key={label} className="rounded-lg border border-border p-2">
                  <p className={`text-lg font-semibold ${tone}`}>{n}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </li>
              ))}
            </ul>
            {preview.duplicates.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Rows that match a saved transaction (same date, type, amount, category and note) are skipped.
              </p>
            )}
            {preview.fresh.length > 0 && (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {preview.fresh.slice(0, 5).map((r, i) => (
                  <li key={i} className="flex justify-between gap-3 px-3 py-1.5 text-[13px]">
                    <span className="truncate">
                      {r.txn_date} · {r.category}
                      {r.note ? ` · ${r.note}` : ''}
                    </span>
                    <span className="shrink-0 tabular-nums">{formatMoney(r.amount_paise, settings.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
            {preview.errors.length > 0 && (
              <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
                <p className="font-medium">Rows that cannot be imported</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {preview.errors.slice(0, 8).map((e) => (
                    <li key={e.line}>
                      Line {e.line}: {e.message}
                    </li>
                  ))}
                </ul>
                {preview.errors.length > 8 && <p className="mt-1">…and {preview.errors.length - 8} more.</p>}
              </div>
            )}
          </div>
        )}
      </Dialog>
    </SettingsSection>
  )
}
