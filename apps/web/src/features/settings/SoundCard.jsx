import { useId } from 'react'
import { Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { toast } from 'sonner'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { Button } from '@/components/ui/button'
import { Select, Switch } from '@/components/ui/form'
import { useSound } from '@/hooks/useSound'
import { PROFILES } from '@/lib/interaction/profiles'
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

const pctOf = (v) => Math.round(v * 100)

/** One of the four built-in profiles: choose it, or listen to it first. */
function ProfileCard({ id, chosen, onChoose, onPreview, disabled }) {
  const p = PROFILES[id]
  return (
    <div
      className={cn(
        'flex flex-col justify-between gap-2 rounded-xl border p-3 transition-colors',
        chosen ? 'border-mod bg-mod/10' : 'border-border bg-surface-2/40 hover:border-border-strong',
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={chosen}
        data-sound="select"
        onClick={onChoose}
        className="min-w-0 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden className={cn('h-2 w-2 rounded-full', chosen ? 'bg-mod' : 'bg-muted-foreground/40')} />
          {p.label}
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">{p.desc}</span>
      </button>
      <Button
        variant="ghost"
        size="sm"
        data-sound="off"
        className="self-start"
        disabled={disabled || !p.sample}
        aria-label={`Preview ${p.label}`}
        onClick={onPreview}
      >
        <Play className="h-3.5 w-3.5" aria-hidden />
        {p.sample ? 'Preview' : 'No sound'}
      </Button>
    </div>
  )
}

/**
 * The Sound & Feedback Studio: master switch and volume, four built-in profiles (one for everyday use, one for focus blocks), a switch,
 * a volume and a preview for each of the ten events, haptics, and a way back to the defaults.
 * These belong to this device (a phone and a laptop want different settings), so they are stored in the browser, not the account.
 */
export function SoundCard() {
  const { prefs, update, profileKey, focusing, eventState, setEvent, resetEvent, reset, preview, previewEvent, previewProfile, events } =
    useSound()
  const volumeId = useId()
  const silent = !prefs.enabled || prefs.muted
  const pct = pctOf(prefs.volume)
  return (
    <SettingsSection
      headingAs="h3"
      icon={prefs.enabled && !prefs.muted ? Volume2 : VolumeX}
      title="Sound & Feedback Studio"
      desc="Choose how LifeTrack sounds as you work, down to each event. Stored on this device."
    >
      <Row title="Sound effects" desc="The master switch for every sound below.">
        <Switch label="Sound effects" checked={prefs.enabled} onChange={(on) => update({ enabled: on })} />
      </Row>

      <div className={cn('space-y-3 transition-opacity', !prefs.enabled && 'opacity-50')}>
        <div className="flex items-center justify-between">
          <label htmlFor={volumeId} className="text-sm font-medium">
            Master volume
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
        </div>
      </div>

      <fieldset className={cn('space-y-2.5 transition-opacity', !prefs.enabled && 'opacity-50')}>
        <legend className="text-sm font-medium">Everyday profile</legend>
        <div role="radiogroup" aria-label="Everyday profile" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {Object.keys(PROFILES).map((id) => (
            <ProfileCard
              key={id}
              id={id}
              chosen={prefs.profile === id}
              disabled={!prefs.enabled}
              onChoose={() => update({ profile: id })}
              onPreview={() => previewProfile(id)}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Choosing a profile sets every event below to its defaults. Change any of them afterwards.
        </p>
      </fieldset>

      <div className={cn('space-y-3 rounded-lg border border-border p-3 transition-opacity', !prefs.enabled && 'opacity-50')}>
        <Row
          title="Switch profile during focus"
          desc={
            focusing && prefs.autoFocus
              ? 'A focus block is running, so the focus profile is in use right now.'
              : 'While a focus block is running, use the profile below.'
          }
        >
          <Switch label="Switch profile during focus" checked={prefs.autoFocus} onChange={(on) => update({ autoFocus: on })} />
        </Row>
        <Row title="Focus profile" dim={!prefs.autoFocus}>
          {(id) => (
            <Select
              id={id}
              aria-label="Focus profile"
              className="h-9 w-40"
              disabled={!prefs.enabled || !prefs.autoFocus}
              value={prefs.focusProfile}
              onChange={(e) => update({ focusProfile: e.target.value })}
            >
              {Object.entries(PROFILES).map(([k, p]) => (
                <option key={k} value={k}>
                  {p.label}
                </option>
              ))}
            </Select>
          )}
        </Row>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium">
          Events <span className="font-normal text-muted-foreground">· {PROFILES[profileKey].label} profile</span>
        </p>
        <ul className={cn('divide-y divide-border rounded-lg border border-border', !prefs.enabled && 'opacity-50')}>
          {Object.entries(events).map(([name, e]) => {
            const st = eventState(name)
            const vol = pctOf(st.volume)
            return (
              <li
                key={name}
                className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_9rem_auto]"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {e.label}
                    {st.customised && (
                      <button
                        type="button"
                        data-sound="off"
                        onClick={() => resetEvent(name)}
                        className="ml-2 text-[11px] font-normal text-mod-text underline underline-offset-2"
                        aria-label={`Reset ${e.label} to the profile`}
                      >
                        Edited · reset
                      </button>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{e.desc}</p>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-1 sm:order-3">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    data-sound="off"
                    aria-label={`Preview ${e.label}`}
                    disabled={!prefs.enabled}
                    onClick={() => previewEvent(name)}
                  >
                    <Play className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                  <Switch label={e.label} checked={st.enabled} onChange={(on) => setEvent(name, { enabled: on })} />
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="10"
                  value={vol}
                  disabled={!prefs.enabled || !st.enabled}
                  aria-label={`${e.label} volume`}
                  aria-valuetext={`${vol}%`}
                  onChange={(ev) => setEvent(name, { volume: Number(ev.target.value) / 100 })}
                  onPointerUp={() => previewEvent(name)}
                  onKeyUp={(ev) => ev.key.startsWith('Arrow') && previewEvent(name)}
                  className="lt-range col-span-full h-8 min-w-0 disabled:opacity-40 sm:order-2 sm:col-span-1"
                  style={{ '--fill': `${vol}%` }}
                />
              </li>
            )
          })}
        </ul>
      </div>

      <Row
        title="Haptic feedback"
        desc="A light vibration on phones that support it. Off automatically if your device asks for reduced motion."
      >
        <Switch label="Haptic feedback" checked={prefs.haptics} onChange={(on) => update({ haptics: on })} />
      </Row>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          Sounds start after your first tap or key press on a page, as browsers require. They are built on your device, so nothing is
          downloaded. Animations follow your system&apos;s reduced-motion setting.
        </p>
        <Button
          variant="outline"
          size="sm"
          data-sound="off"
          onClick={() => {
            reset()
            toast.success('Sound settings restored to the defaults')
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Restore defaults
        </Button>
      </div>
    </SettingsSection>
  )
}
