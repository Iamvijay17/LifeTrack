import { Download } from 'lucide-react'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { Button } from '@/components/ui/button'
import { useAction } from '@/hooks/useAction'
import { download, tableToCsv, EXPORTABLE } from '@/services/csv'

/** One spreadsheet-ready CSV per module, read straight from the database. */
export function CsvCard() {
  const [exportTable, busy] = useAction(async (table) => {
    const csv = await tableToCsv(table)
    if (!csv) throw new Error('Nothing to export yet.')
    download(`lifetrack-${table}.csv`, csv)
  })
  return (
    <SettingsSection title="Export to CSV" desc="One spreadsheet-ready file per module. Reports can be exported from the Reports page.">
      <div className="flex flex-wrap gap-2">
        {EXPORTABLE.map(([table, label]) => (
          <Button key={table} variant="outline" size="sm" disabled={busy} onClick={() => exportTable(table)}>
            <Download className="h-3.5 w-3.5" />
            {label}
          </Button>
        ))}
      </div>
    </SettingsSection>
  )
}
