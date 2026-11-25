import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, FileDown, Loader2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, Input } from '@/components/ui/form'
import { Progress, Segmented } from '@/components/ui/misc'
import { fmtDay } from '@/lib/dates'
import { buildReportPdf, defaultTitle } from './buildReportPdf'
import { MODULES } from './templates'
import { usePdfExport } from './usePdfExport'

const ORIENTATIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
]

/** Pick the title, sections and layout of a report PDF, then build and download it. `ctx` is what buildReportPdf needs. */
export function ExportPdfDialog({ open, onOpenChange, ctx, available }) {
  const { from, to } = ctx
  const exporter = usePdfExport()
  const [title, setTitle] = useState('')
  const [modules, setModules] = useState([])
  const [orientation, setOrientation] = useState('auto')
  const initial = useMemo(() => MODULES.filter((m) => m.id !== 'daily' && available.includes(m.id)).map((m) => m.id), [available])

  useEffect(() => {
    if (!open) return
    setTitle(defaultTitle(from, to))
    setModules(initial)
    setOrientation('auto')
    exporter.reset()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps -- reset only when it opens; later changes of the period must not wipe the user's choices

  const toggle = (id, on) => setModules((m) => (on ? [...m, id] : m.filter((x) => x !== id)))
  const job = () => (onProgress) =>
    buildReportPdf(ctx, { title, modules: MODULES.map((m) => m.id).filter((id) => modules.includes(id)), orientation, onProgress })
  const run = () => exporter.start(job())

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (exporter.busy ? undefined : onOpenChange(o))}
      title="Export PDF report"
      description={`${fmtDay(from, 'd MMM yyyy')} – ${fmtDay(to, 'd MMM yyyy')}. Only sections with recorded data are included.`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={exporter.busy}>
            {exporter.status === 'done' ? 'Close' : 'Cancel'}
          </Button>
          {exporter.status === 'error' ? (
            <Button onClick={exporter.retry}>Try again</Button>
          ) : (
            <Button onClick={run} disabled={exporter.busy || !modules.length || !title.trim()}>
              {exporter.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              {exporter.busy ? 'Building…' : exporter.status === 'done' ? 'Download again' : 'Export PDF'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Report title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={90} disabled={exporter.busy} />
        </Field>
        <fieldset disabled={exporter.busy} className="space-y-2">
          <legend className="mb-1.5 text-[13px] font-medium text-foreground/90">Sections</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {MODULES.map((m) => (
              <div key={m.id} className="rounded-lg border border-border px-3 py-2">
                <Checkbox checked={modules.includes(m.id)} onChange={(on) => toggle(m.id, on)} label={m.label} />
                <p className="ml-7 mt-0.5 text-xs text-muted-foreground">{available.includes(m.id) ? m.hint : 'Locked or unavailable'}</p>
              </div>
            ))}
          </div>
        </fieldset>
        <Field label="Page layout" hint="Auto keeps pages upright and turns wide tables sideways.">
          <Segmented value={orientation} onChange={setOrientation} options={ORIENTATIONS} aria-label="Page layout" />
        </Field>
        {exporter.busy && (
          <div role="status" aria-live="polite" className="space-y-1.5">
            <Progress value={exporter.progress * 100} label="Export progress" />
            <p className="text-xs text-muted-foreground">{exporter.label}…</p>
          </div>
        )}
        {exporter.status === 'done' && (
          <p role="status" className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" /> The PDF was built and downloaded.
          </p>
        )}
        {exporter.status === 'error' && (
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {exporter.error}
          </p>
        )}
      </div>
    </Dialog>
  )
}
