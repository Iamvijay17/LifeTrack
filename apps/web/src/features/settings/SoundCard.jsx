import { useId } from 'react'
import { Play, Volume2, VolumeX } from 'lucide-react'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/form'
import { useSound } from '@/hooks/useSound'
import { cn } from '@/lib/utils'

/** A label and its explanation on the left, the control on the right. */
function Row({ title, desc, children, dim }) {
  const id = useId()
  return (
    <div className={cn('flex items-center justify-between gap-4 transition-opacity', dim && 'opacity-50')}>
      <div className="min-w-0">
        <p id={id} className="text-sm font-medium">
          {title}
        </p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{typeof children === 'function' ? children(id) : children}</div>
    </div>
  )
}

/**
 * Sound & interaction: master switch, volume, mute, a switch and a preview for each group of sounds, and haptics.
 * These belong to this device (a phone and a laptop want different settings), so they are stored in the browser, not the account.
 */
export function SoundCard() {
  const { prefs, update, setCategory, preview, categories } = useSound()
  const volumeId = useId()
  const silent = !prefs.enabled || prefs.muted
  const pct = Math.round(prefs.volume * 100)
  return (
    <SettingsSection
      headingAs="h3"
      icon={prefs.enabled && !prefs.muted ? Volume2 : VolumeX}
      title="Sound & interaction"
      desc="Soft sounds and a little vibration as you work. Stored on this device."
    >
      <Row title="Sound effects" desc="Clicks, completions, alerts and the focus timer.">
        <Switch label="Sound effects" checked={prefs.enabled} onChange={(on) => update({ enabled: on })} />
      </Row>

      <div className={cn('space-y-3 transition-opacity', !prefs.enabled && 'opacity-50')}>
        <div className="flex items-center justify-between">
          <label htmlFor={volumeId} className="text-sm font-medium">
            Volume
          </label>
          <span className="text-xs tabular-nums text-muted-foreground" aria-hidden>
            {prefs.muted ? 'Muted' : `${pct}%`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            data-sound="off"
            aria-label={prefs.muted ? 'Unmute' : 'Mute'}
            aria-pressed={prefs.muted}
            onClick={() => {
              update({ muted: !prefs.muted })
              if (prefs.muted) preview('select') // unmuting: let them hear it is back
            }}
          >
            {silent ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
          <input
            id={volumeId}
            type="range"
            min="0"
            max="100"
            step="5"
            value={pct}
            disabled={!prefs.enabled}
            aria-valuetext={`${pct}%`}
            onChange={(e) => update({ volume: Number(e.target.value) / 100, muted: false })}
            onPointerUp={() => preview('select')}
            onKeyUp={(e) => e.key.startsWith('Arrow') && preview('select')}
            className="lt-range h-11 min-w-0 flex-1 md:h-6"
            style={{ '--fill': `${pct}%` }}
          />
          <Button variant="outline" size="sm" data-sound="off" disabled={!prefs.enabled} onClick={() => preview('success')}>
            <Play className="h-3.5 w-3.5" aria-hidden />
            Preview
          </Button>
        </div>
      </div>

      <div className={cn('divide-y divide-border rounded-lg border border-border', !prefs.enabled && 'opacity-50')}>
        {Object.entries(categories).map(([name, c]) => (
          <div key={name} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{c.label}</p>
              <p className="text-xs text-muted-foreground">{c.desc}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                data-sound="off"
                aria-label={`Preview ${c.label}`}
                disabled={!prefs.enabled}
                onClick={() => preview(c.sample)}
              >
                <Play className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <Switch label={c.label} checked={prefs.categories[name]} onChange={(on) => setCategory(name, on)} />
            </div>
          </div>
        ))}
      </div>

      <Row
        title="Haptic feedback"
        desc="A light vibration on phones that support it. Off automatically if your device asks for reduced motion."
      >
        <Switch label="Haptic feedback" checked={prefs.haptics} onChange={(on) => update({ haptics: on })} />
      </Row>
      <p className="text-xs text-muted-foreground">
        Sounds start after your first tap or key press on a page, as browsers require. Animations follow your system&apos;s reduced-motion
        setting.
      </p>
    </SettingsSection>
  )
}
