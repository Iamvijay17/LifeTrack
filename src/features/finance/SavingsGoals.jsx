import { useEffect, useState } from 'react'
import { PiggyBank, Pencil, Plus, Trash2, PlusCircle } from 'lucide-react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/form'
import { Progress } from '@/components/ui/misc'
import { Menu } from '@/components/ui/menu'
import { FormDialog } from '@/components/shared/FormDialog'
import { EmptyState } from '@/components/shared/states'
import { useConfirm } from '@/components/shared/Confirm'
import { useTable } from '@/hooks/store'
import * as store from '@/hooks/store'
import { useAction } from '@/hooks/useAction'
import { isValidDay, fmtDay } from '@/lib/dates'
import { parseMoney, paiseToInput } from '@/lib/money'

const amount = (label, min = 1) => z.string().trim().refine((v) => { const p = parseMoney(v); return p !== null && p >= min }, `Enter a valid ${label}`)
const schema = z.object({
  name: z.string().trim().min(1, 'Name the goal').max(80, 'Keep it under 80 characters'),
  target: amount('target amount (more than 0)'),
  saved: z.string().trim().refine((v) => v === '' || parseMoney(v) !== null, 'Enter a valid amount'),
  target_date: z.string().refine((v) => v === '' || isValidDay(v), 'Enter a valid date'),
})

function GoalDialog({ open, onOpenChange, goal }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: { name: '', target: '', saved: '', target_date: '' } })
  useEffect(() => { if (open) reset(goal ? { name: goal.name, target: paiseToInput(goal.target_paise), saved: paiseToInput(goal.saved_paise), target_date: goal.target_date ?? '' } : { name: '', target: '', saved: '', target_date: '' }) }, [open, goal?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, pending] = useAction(async (v) => {
    const row = { name: v.name.trim(), target_paise: parseMoney(v.target), saved_paise: v.saved ? parseMoney(v.saved) : 0, target_date: v.target_date || null }
    if (goal) await store.update('savings_goals', goal.id, row); else await store.insert('savings_goals', row)
    onOpenChange(false)
  }, { success: goal ? 'Savings goal updated' : 'Savings goal created' })
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={goal ? 'Edit savings goal' : 'New savings goal'} pending={pending} onSubmit={handleSubmit(save)}>
      <Field label="What are you saving for?" error={errors.name?.message}><Input autoFocus placeholder="e.g. Emergency fund" {...register('name')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target amount" error={errors.target?.message}><Input inputMode="decimal" {...register('target')} /></Field>
        <Field label="Saved so far" error={errors.saved?.message}><Input inputMode="decimal" placeholder="0" {...register('saved')} /></Field>
      </div>
      <Field label="Target date (optional)" error={errors.target_date?.message}><Input type="date" {...register('target_date')} /></Field>
    </FormDialog>
  )
}

function AddFunds({ goal, onClose, money }) {
  const [v, setV] = useState('')
  const [add, pending] = useAction(async () => {
    const p = parseMoney(v)
    if (p === null || p <= 0) throw new Error('Enter an amount greater than 0.')
    // read the freshest cached value so two quick additions don't overwrite each other on this device
    const fresh = store.peek('savings_goals').find((g) => g.id === goal.id) ?? goal
    await store.update('savings_goals', goal.id, { saved_paise: fresh.saved_paise + p })
    onClose()
  }, { success: 'Added to savings goal' })
  return (
    <FormDialog open onOpenChange={(o) => !o && onClose()} title={`Add to “${goal.name}”`} description={`${money(goal.saved_paise)} of ${money(goal.target_paise)} saved`} pending={pending} submitLabel="Add" onSubmit={(e) => { e.preventDefault(); add() }}>
      <Field label="Amount"><Input autoFocus inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="0.00" /></Field>
    </FormDialog>
  )
}

export function SavingsGoals({ money }) {
  const { rows } = useTable('savings_goals')
  const confirm = useConfirm()
  const [dlg, setDlg] = useState({ open: false, goal: null })
  const [funds, setFunds] = useState(null)
  const [del] = useAction((id) => store.remove('savings_goals', id), { success: 'Savings goal deleted' })
  return (
    <Card>
      <CardHeader><CardTitle>Savings goals</CardTitle><Button variant="outline" size="sm" onClick={() => setDlg({ open: true, goal: null })}><Plus className="h-4 w-4" />Goal</Button></CardHeader>
      <CardContent>
        {rows.length === 0 ? <EmptyState icon={PiggyBank} title="No savings goals" description="Set a target — an emergency fund, a laptop, a trip — and track what you've put aside." action={<Button size="sm" onClick={() => setDlg({ open: true, goal: null })}>Create a savings goal</Button>} />
          : <ul className="grid gap-3 md:grid-cols-2">{rows.map((g) => { const pct = Math.min(100, Math.round((g.saved_paise / g.target_paise) * 100)); return (
            <li key={g.id} className="rounded-lg border border-border p-3" data-testid="savings-goal">
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{g.name}</p><p className="text-xs text-muted-foreground">{money(g.saved_paise)} of {money(g.target_paise)}{g.target_date ? ` · by ${fmtDay(g.target_date, 'd MMM yyyy')}` : ''}</p></div>
                <Menu label={`Actions for ${g.name}`} items={[{ label: 'Add funds', icon: PlusCircle, onClick: () => setFunds(g) }, { label: 'Edit', icon: Pencil, onClick: () => setDlg({ open: true, goal: g }) }, { label: 'Delete', icon: Trash2, danger: true, onClick: async () => { if (await confirm({ title: 'Delete this savings goal?', description: g.name })) del(g.id) } }]} /></div>
              <div className="mt-3 flex items-center gap-3"><Progress value={pct} tone={pct >= 100 ? 'success' : 'primary'} label={`${g.name} progress`} /><span className="w-10 text-right text-xs tabular-nums">{pct}%</span></div>
            </li>) })}</ul>}
      </CardContent>
      <GoalDialog open={dlg.open} goal={dlg.goal} onOpenChange={(o) => setDlg((d) => ({ ...d, open: o }))} />
      {funds && <AddFunds goal={funds} money={money} onClose={() => setFunds(null)} />}
    </Card>
  )
}
