import { useState } from 'react'
import { Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/misc'
import { explainScore } from '@lifetrack/core/score'

export function ScoreCard({ result, weekAvg }) {
  const [open, setOpen] = useState(false)
  const s = result.score
  const tone = s == null ? 'primary' : s >= 75 ? 'success' : s >= 40 ? 'primary' : 'warning'
  return (
    <Card data-testid="score-card">
      <CardHeader><CardTitle>Daily score</CardTitle><button onClick={() => setOpen(true)} className="flex items-center gap-1 text-xs text-secondary hover:underline"><Info className="h-3.5 w-3.5" />How is this calculated?</button></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-2"><span className="text-4xl font-semibold tabular-nums" data-testid="score-value">{s ?? '—'}</span><span className="text-sm text-muted-foreground">/ 100</span>{weekAvg != null && <span className="ml-auto text-xs text-muted-foreground">week avg {weekAvg}</span>}</div>
        <Progress value={s ?? 0} tone={tone} label="Daily score" />
        {s == null && <p className="text-xs text-muted-foreground">Nothing planned or logged yet — rest days and empty categories are never counted as zero.</p>}
        <ul className="space-y-1.5">{result.categories.map((c) => (
          <li key={c.key} className="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-2 text-xs"><span className="truncate text-muted-foreground">{c.label}</span>
            {c.applicable ? <Progress value={c.fraction * 100} tone={c.fraction >= 1 ? 'success' : 'primary'} label={c.label} /> : <span className="text-muted-foreground/70">not planned</span>}
            <span className="text-right tabular-nums text-muted-foreground">{c.applicable ? `${Math.round(c.fraction * 100)}%` : '—'}</span></li>))}</ul>
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen} title="How your daily score works" footer={<Button variant="outline" onClick={() => setOpen(false)}>Close</Button>} className="md:max-w-xl">
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">{explainScore(result)}</p>
          <ul className="space-y-3">{result.categories.map((c) => (
            <li key={c.key} className="rounded-md border border-border p-3"><div className="flex items-center justify-between"><b>{c.label}</b><span className="text-xs text-muted-foreground">weight {c.weight}%{c.applicable && c.effectiveWeight > 0 ? ` → counts as ${Math.round(c.effectiveWeight)}% today` : ''}</span></div>
              <p className="mt-0.5 text-xs text-muted-foreground">{c.hint}</p>
              {c.applicable ? <ul className="mt-2 space-y-0.5 text-xs">{c.items.map((i) => <li key={i.label} className="flex justify-between"><span>{i.label}</span><span className="tabular-nums text-muted-foreground">{i.detail} · {Math.round(i.fraction * 100)}%</span></li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">Nothing planned or logged for this category today, so it is skipped.</p>}</li>))}</ul>
          <p className="text-xs text-muted-foreground">Change the weights in Settings → Daily score weights.</p>
        </div>
      </Dialog>
    </Card>
  )
}
