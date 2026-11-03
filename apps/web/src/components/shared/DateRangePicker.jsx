import { Input } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'

const DEFAULT_LABELS = { week: 'Week', month: 'Month', year: 'Year', custom: 'Custom' }

/** Preset buttons plus (for "custom") two date inputs. Driven by useDateRange(). */
export function DateRangePicker({ range, labels = DEFAULT_LABELS, className }) {
  const { preset, setPreset, custom, setCustom } = range
  const options = ['week', 'month', 'year', 'custom'].map((value) => ({ value, label: labels[value] }))
  return (
    <div className={className ?? 'flex flex-wrap items-center gap-3'}>
      <Segmented value={preset} onChange={setPreset} options={options} />
      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="From"
            className="w-36"
            value={custom.from}
            max={custom.to}
            onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })}
          />
          <span className="text-muted-foreground">→</span>
          <Input
            type="date"
            aria-label="To"
            className="w-36"
            value={custom.to}
            min={custom.from}
            onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })}
          />
        </div>
      )}
    </div>
  )
}
