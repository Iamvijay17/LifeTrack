import { useState } from 'react'
import { Droplets } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/form'
import { Progress } from '@/components/ui/misc'
import { addWater } from '@/services/api'
import { useAction } from '@/hooks/useAction'
import { useTable } from '@/hooks/store'
import { useSettings } from '@/hooks/useSettings'

export function WaterDialog({ open, onOpenChange, date }) {
  const { rows } = useTable('health_logs')
  const { settings } = useSettings()
  const [custom, setCustom] = useState('')
  const current = rows.find((h) => h.log_date === date)?.water_ml ?? 0
  const [add, pending] = useAction((ml) => addWater(date, ml), { success: (_o) => 'Water logged' })
  const goal = settings.water_goal_ml
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Log water" description={`${current} ml${goal ? ` of ${goal} ml` : ''} today`}>
      <div className="space-y-4">
        {goal > 0 && <Progress value={(current / goal) * 100} tone="success" label="Water progress" />}
        <div className="grid grid-cols-4 gap-2">
          {[150, 250, 500, 1000].map((ml) => (
            <Button key={ml} variant="outline" disabled={pending} onClick={() => add(ml)}>
              <Droplets className="h-3.5 w-3.5" />
              {ml}
            </Button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            const n = Math.floor(Number(custom))
            if (n > 0 && n <= 5000) {
              if (await add(n)) setCustom('')
            }
          }}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={5000}
            placeholder="Custom ml"
            aria-label="Custom amount in ml"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
          <Button type="submit" disabled={pending || !(Number(custom) > 0 && Number(custom) <= 5000)}>
            Add
          </Button>
        </form>
        {current > 0 && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={pending} onClick={() => add(-250)}>
            Undo last 250 ml
          </Button>
        )}
      </div>
    </Dialog>
  )
}
