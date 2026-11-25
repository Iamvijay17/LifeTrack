import { Coffee, Pause, Play, SkipForward, Square, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { Magnetic } from '@/components/motion/primitives'
import { MODE_LABEL, PRESETS } from '@/domain/focus'
import { Dial } from './Dial'

const MODES = [
  { value: 'focus', label: 'Focus' },
  { value: 'short_break', label: 'Short break' },
  { value: 'long_break', label: 'Long break' },
]
const PRESET_OPTIONS = [...PRESETS.map((p) => ({ value: String(p.minutes), label: p.label })), { value: 'custom', label: 'Custom' }]

/**
 * The timer: setup (mode, length, what you are working on) before a block starts; pause / resume / stop while it runs.
 * Presentational — `setup` holds the form values and every action is a callback from the page.
 */
export function TimerCard({ timer, setup, onSetup, minutes, validMinutes, tasks, topics, breakMinutes, onStart, onStop, onSkipBreak }) {
  const active = timer.timer
  const shownMode = active?.mode ?? setup.mode
  const total = (active?.plannedMinutes ?? (validMinutes ? minutes : 25)) * 60
  const set = (key) => (value) => onSetup({ ...setup, [key]: value })

  return (
    <Card className="lt-hero lg:col-span-3">
      <CardContent className="space-y-5 py-7">
        {!active && <Segmented className="mx-auto flex w-fit" value={setup.mode} onChange={set('mode')} options={MODES} />}
        {active && (
          <p className="animate-fade-in text-center text-sm font-medium text-mod-text">
            {MODE_LABEL[active.mode]}
            {active.label ? ` · ${active.label}` : ''}
          </p>
        )}
        <Dial
          left={active ? timer.left : validMinutes ? minutes * 60 : 0}
          total={total}
          mode={shownMode}
          running={!!active && timer.running}
        />
        {!active ? (
          <div className="mx-auto max-w-sm space-y-3">
            {setup.mode === 'focus' ? (
              <>
                <div className="flex flex-wrap items-end justify-center gap-2">
                  <Segmented value={setup.preset} onChange={set('preset')} options={PRESET_OPTIONS} />
                  {setup.preset === 'custom' && (
                    <Field label="Minutes" className="w-24">
                      <Input type="number" min={1} max={240} value={setup.custom} onChange={(e) => set('custom')(e.target.value)} />
                    </Field>
                  )}
                </div>
                <Field label="Working on">
                  <Select value={setup.target} onChange={(e) => set('target')(e.target.value)}>
                    <option value="">Nothing specific</option>
                    {tasks.length > 0 && (
                      <optgroup label="Tasks">
                        {tasks.map((t) => (
                          <option key={t.id} value={`task:${t.id}`}>
                            {t.title}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="Learning topics">
                      {topics.map((t) => (
                        <option key={t.id} value={`topic:${t.id}`}>
                          {t.group_name} · {t.name}
                        </option>
                      ))}
                    </optgroup>
                  </Select>
                </Field>
                <Field label="Note (optional)">
                  <Input
                    maxLength={120}
                    value={setup.label}
                    onChange={(e) => set('label')(e.target.value)}
                    placeholder="e.g. Chapter 4 exercises"
                  />
                </Field>
              </>
            ) : (
              <p className="text-center text-sm text-muted-foreground">{breakMinutes}-minute break. Change break lengths in Settings.</p>
            )}
            <Magnetic className="flex w-full" strength={0.08}>
              <Button size="lg" className="w-full" data-sound="timerStart" onClick={onStart} disabled={!validMinutes}>
                {setup.mode === 'focus' ? <Timer className="h-4 w-4" /> : <Coffee className="h-4 w-4" />}Start{' '}
                {MODE_LABEL[setup.mode].toLowerCase()}
              </Button>
            </Magnetic>
          </div>
        ) : (
          <div className="flex justify-center gap-2">
            {timer.running ? (
              <Button variant="outline" data-sound="timerPause" onClick={timer.pause}>
                <Pause className="h-4 w-4" />
                Pause
              </Button>
            ) : (
              <Button data-sound="timerStart" onClick={timer.resume}>
                <Play className="h-4 w-4" />
                Resume
              </Button>
            )}
            {active.mode === 'focus' ? (
              <Button variant="outline" data-sound="timerStop" onClick={onStop}>
                <Square className="h-4 w-4" />
                Stop &amp; save
              </Button>
            ) : (
              <Button variant="outline" onClick={onSkipBreak}>
                <SkipForward className="h-4 w-4" />
                Skip break
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
