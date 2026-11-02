import { useEffect, useState } from 'react'
import { PiggyBank, Pencil, Plus, Trash2, PlusCircle } from 'lucide-react'
import { blankSavingsGoal, parseAmountOrThrow, savingsGoalFormSchema, savingsGoalToForm, savingsGoalToPayload } from '@lifetrack/schemas'
import { savingsGoalPercent } from '@lifetrack/core/finance'
import { addSavingsFunds } from '@/services/api'
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
import { fmtDay } from '@/lib/dates'

const schema = savingsGoalFormSchema

function GoalDialog({ open, onOpenChange, goal }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: blankSavingsGoal() })
  useEffect(() => { if (open) reset(goal ? savingsGoalToForm(goal) : blankSavingsGoal()) }, [open, goal?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [save, pending] = useAction(async (v) => {
    const row = savingsGoalToPayload(v)
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
    await addSavingsFunds(goal, parseAmountOrThrow(v, 'Enter an amount greater than 0.'))
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
          : <ul className="grid gap-3 md:grid-cols-2">{rows.map((g) => { const pct = savingsGoalPercent(g); return (
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
