import { useId } from 'react'
import { Check, LayoutDashboard, Palette, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SettingsSection } from '@/components/shared/SettingsSection'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/form'
import { Segmented } from '@/components/ui/misc'
import { useAction } from '@/hooks/useAction'
import { resetAppearance, setAppearance, useAppearance } from '@/hooks/useAppearance'
import { useSettings } from '@/hooks/useSettings'
import { applyTheme } from '@/hooks/useTheme'
import { ACCENTS, DENSITIES, FONT_SIZES, MOTIONS, accentHex, accentTokens, contrast, hexToRgb, isDefaultAppearance } from '@/lib/appearance'
import { cn } from '@/lib/utils'

const THEMES = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
]

/** A label and what it does on the left, the control on the right (stacked on a phone). */
function Row({ title, desc, children }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p id={id} className="text-sm font-medium">
          {title}
        </p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      <div className="min-w-0 sm:shrink-0">{typeof children === 'function' ? children(id) : children}</div>
    </div>
  )
}

function Swatch({ hex, label, selected, onSelect }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      onClick={onSelect}
      className={cn(
        'lt-press relative grid h-11 w-11 place-items-center rounded-full ring-offset-2 ring-offset-card transition-shadow md:h-9 md:w-9',
        selected ? 'ring-2 ring-foreground/80' : 'hover:ring-2 hover:ring-foreground/25',
      )}
      style={{ background: hex }}
    >
      {selected && <Check className="h-4 w-4 text-white drop-shadow" aria-hidden />}
    </button>
  )
}

function AccentPicker({ prefs }) {
  const customId = useId()
  const hex = accentHex(prefs)
  const rgb = hexToRgb(hex)
  const shown = accentTokens(hex, 'dark')['--primary-solid'].split(' ').map(Number)
  const adjusted = prefs.accent === 'custom' && contrast(rgb, [255, 255, 255]) < 4.5
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap items-center gap-2.5">
        {ACCENTS.map((a) => (
          <Swatch
            key={a.key}
            hex={a.hex}
            label={a.label}
            selected={prefs.accent === a.key}
            onSelect={() => setAppearance({ accent: a.key })}
          />
        ))}
        <label
          htmlFor={customId}
          className={cn(
            'lt-press relative grid h-11 w-11 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-border md:h-9 md:w-9',
            prefs.accent === 'custom' && 'ring-2 ring-foreground/80 ring-offset-2 ring-offset-card',
          )}
          style={prefs.accent === 'custom' ? { background: prefs.custom_accent } : undefined}
          title="Custom colour"
        >
          <span className="sr-only">Custom colour</span>
          {prefs.accent === 'custom' ? (
            <Check className="h-4 w-4 text-white drop-shadow" aria-hidden />
          ) : (
            <Palette className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
          <input
            id={customId}
            type="color"
            value={prefs.custom_accent}
            onChange={(e) => setAppearance({ accent: 'custom', custom_accent: e.target.value })}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
      {adjusted && (
        <p className="text-xs text-muted-foreground" data-testid="accent-adjusted">
          That colour is light, so buttons use a deeper shade (<span className="font-mono">rgb({shown.join(' ')})</span>) to keep white text
          easy to read.
        </p>
      )}
    </div>
  )
}

/** Theme, accent colour, text size, spacing, motion and the dashboard's starting layout. */
export function AppearanceCard() {
  const { settings, save } = useSettings()
  const prefs = useAppearance()
  const [setTheme] = useAction(async (theme) => {
    applyTheme(theme) // apply immediately, then persist to the account
    await save({ theme })
  })
  return (
    <SettingsSection headingAs="h3" icon={Palette} title="Appearance" desc="How LifeTrack looks. Follows your account on every device.">
      <Row title="Theme" desc="Dark, light, or whatever your device uses.">
        <Segmented value={settings.theme} onChange={setTheme} options={THEMES} />
      </Row>
      <Row title="Accent colour" desc="Buttons, links, focus rings and the dashboard. Each module keeps its own colour.">
        <AccentPicker prefs={prefs} />
      </Row>
      <Row title="Text size">
        <Segmented value={prefs.font_size} onChange={(font_size) => setAppearance({ font_size })} options={FONT_SIZES} />
      </Row>
      <Row title="Spacing" desc="Compact fits more on screen.">
        <Segmented value={prefs.density} onChange={(density) => setAppearance({ density })} options={DENSITIES} />
      </Row>
      <Row title="Animations" desc="Reducing motion turns off page transitions, counters and celebrations.">
        <Segmented value={prefs.motion} onChange={(motion) => setAppearance({ motion })} options={MOTIONS} />
      </Row>
      <Row title="Sidebar" desc="Start with the compact icon-only sidebar on larger screens.">
        {(id) => (
          <Switch
            checked={prefs.sidebar.collapsed}
            onChange={(collapsed) => setAppearance({ sidebar: { collapsed } })}
            label="Compact sidebar"
            aria-labelledby={id}
          />
        )}
      </Row>
      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-4 w-4 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">Dashboard layout</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Drag, resize and add widgets, keep several dashboards (workspaces) and start from a template with{' '}
          <Link to="/" className="text-mod-text underline underline-offset-2">
            Edit dashboard
          </Link>
          .
        </p>
      </div>
      <div className="flex justify-end border-t border-border pt-3">
        <Button variant="ghost" size="sm" onClick={resetAppearance} disabled={isDefaultAppearance(prefs)}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          Reset appearance
        </Button>
      </div>
    </SettingsSection>
  )
}
