import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { FormDialog } from '@/components/shared/FormDialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/form'
import { useAction } from '@/hooks/useAction'
import { fmtDay } from '@/lib/dates'
import { MAX_EVIDENCE, checkinProblem, cleanEvidence, effectiveCheckins } from '@/domain/challenges'
import { celebrate } from '@/lib/celebrate'
import { toast } from 'sonner'
import { checkInChallenge, updateCheckin } from '@/services/api'

const blankLink = () => ({ label: '', url: '' })

/**
 * Check in with a note, an amount and evidence links; or, with `existing`, change a check-in already made. The day is chosen from the challenge's own dates
 * (up to today in the person's timezone), and a day that already has a check-in is explained instead of being saved twice.
 */
export function CheckInDialog({ open, onOpenChange, card, habitLogs, checkins, today, date, existing }) {
  const c = card?.challenge
  const [day, setDay] = useState(today)
  const [amount, setAmount] = useState('1')
  const [note, setNote] = useState('')
  const [links, setLinks] = useState([blankLink()])
  useEffect(() => {
    if (!open || !c) return
    setDay(existing?.checkin_date ?? date ?? today)
    setAmount(String(existing?.amount ?? (c.kind === 'daily' ? c.target : 1)))
    setNote(existing?.note ?? '')
    setLinks(existing?.evidence?.length ? existing.evidence.map((e) => ({ label: e.label ?? '', url: e.url })) : [blankLink()])
    // reset only when the dialog opens for a (different) target
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, c?.id, existing?.id, date])

  const map = useMemo(() => (c ? effectiveCheckins(c, checkins, habitLogs) : new Map()), [c, checkins, habitLogs])
  const amountNum = Number(amount)
  const needsAmount = c && (c.kind === 'total' || (c.kind === 'daily' && c.target > 1))
  const problem = !c
    ? null
    : existing
      ? !Number.isInteger(amountNum) || amountNum < 1
        ? 'Enter a whole amount of at least 1.'
        : null
      : checkinProblem(c, day, today, map, needsAmount ? amountNum : 1)
  const evidence = cleanEvidence(links)
  const unit = c?.unit ? ` ${c.unit}` : ''

  const [save, pending] = useAction(
    async () => {
      const amt = needsAmount ? amountNum : (existing?.amount ?? 1)
      const out = existing
        ? await updateCheckin(existing.id, { amount: amt, note, evidence: links }, today)
        : await checkInChallenge(c.id, { date: day, amount: amt, note, evidence: links, today })
      if (out.completed) {
        celebrate()
        toast.success(`Challenge complete: ${c.title}`)
      }
      onOpenChange(false)
    },
    { success: existing ? 'Check-in updated' : 'Checked in' },
  )

  if (!c) return null
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={existing ? 'Edit check-in' : 'Check in'}
      description={c.title}
      pending={pending}
      onSubmit={(e) => {
        e.preventDefault()
        if (!problem && !evidence.error) save()
      }}
      submitLabel={existing ? 'Save changes' : 'Check in'}
      submitDisabled={!!problem || !!evidence.error}
    >
      <Field
        label="Day"
        error={!existing ? problem : undefined}
        hint={existing ? undefined : `Up to today, within ${fmtDay(c.start_date, 'd MMM yyyy')} to ${fmtDay(c.end_date, 'd MMM yyyy')}.`}
      >
        <Input
          type="date"
          value={day}
          min={c.start_date}
          max={today < c.end_date ? today : c.end_date}
          disabled={!!existing}
          clearable={false}
          onChange={(e) => setDay(e.target.value)}
        />
      </Field>
      {needsAmount && (
        <Field
          label={`Amount${unit ? ` (${c.unit})` : ''}`}
          error={existing ? problem : undefined}
          hint={
            c.kind === 'daily'
              ? `The day counts once it reaches ${c.target.toLocaleString()}${unit}.`
              : `Adds to your total towards ${c.target.toLocaleString()}${unit}.`
          }
        >
          <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      )}
      <Field label="Note (optional)" hint={`${note.length}/500`}>
        <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="How did it go?" />
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-foreground/90">Evidence links (optional)</legend>
        {links.map((l, i) => (
          <div key={i} className="flex gap-2">
            <Input
              aria-label={`Evidence label ${i + 1}`}
              className="w-28 shrink-0"
              placeholder="Label"
              maxLength={80}
              value={l.label}
              onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
            />
            <Input
              aria-label={`Evidence link ${i + 1}`}
              placeholder="https://…"
              value={l.url}
              onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove link ${i + 1}`}
              onClick={() => setLinks(links.length > 1 ? links.filter((_, j) => j !== i) : [blankLink()])}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {evidence.error && (
          <p role="alert" className="text-xs text-danger">
            {evidence.error}
          </p>
        )}
        {links.length < MAX_EVIDENCE && (
          <Button variant="ghost" size="sm" onClick={() => setLinks([...links, blankLink()])}>
            <Plus className="h-4 w-4" /> Add a link
          </Button>
        )}
      </fieldset>
    </FormDialog>
  )
}
