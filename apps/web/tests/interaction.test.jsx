import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { Toaster } from 'sonner'
import { InteractionProvider } from '@/components/interaction/InteractionProvider'
import { SoundCard } from '@/features/settings/SoundCard'
import { useAction } from '@/hooks/useAction'
import { CUES, DEFAULT_PREFS, cueForTarget, getPrefs, normalizePrefs, setPrefs, sound } from '@/lib/interaction'
import { resetPrefs, resetPrefsCache, setFocusActive } from '@/lib/interaction/prefs'
import { PROFILES, EVENTS } from '@/lib/interaction/profiles'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/form'

// A stand-in for the Web Audio graph that records what was scheduled.
const node = () => {
  const n = {
    connect: (x) => x ?? n,
    disconnect() {},
    gain: param(),
    frequency: param(),
    Q: param(),
    start() {},
    stop() {},
    threshold: {},
    ratio: {},
  }
  return n
}
const param = () => ({
  value: 1,
  setValueAtTime() {},
  linearRampToValueAtTime() {},
  exponentialRampToValueAtTime() {},
  cancelScheduledValues() {},
})
class FakeAudioContext {
  state = 'running'
  currentTime = 0
  sampleRate = 8000
  destination = node()
  createGain() {
    return node()
  }
  createOscillator = node
  createBiquadFilter = node
  createDynamicsCompressor = node
  createBufferSource = node
  createBuffer(_c, len) {
    return { getChannelData: () => new Float32Array(len) }
  }
  resume() {
    this.state = 'running'
    return Promise.resolve()
  }
}

beforeEach(() => {
  localStorage.clear()
  resetPrefsCache()
  sound.reset()
  sound.ctx = null
  window.AudioContext = FakeAudioContext
  vi.spyOn(performance, 'now').mockReturnValue(1000)
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
})
afterEach(() => vi.restoreAllMocks())

const at = (ms) => performance.now.mockReturnValue(ms)

describe('preferences', () => {
  it('defaults to enabled at a subtle volume and repairs bad stored values', () => {
    expect(getPrefs()).toEqual(DEFAULT_PREFS)
    const fixed = normalizePrefs({
      volume: 9,
      enabled: 'yes',
      profile: 'loud',
      events: { taskDone: { volume: 4, enabled: 'no' }, bogus: { enabled: false } },
    })
    expect(fixed.volume).toBe(1)
    expect(fixed.enabled).toBe(true)
    expect(fixed.profile).toBe(DEFAULT_PREFS.profile)
    expect(fixed.events).toEqual({ taskDone: { volume: 1 } })
  })

  it("turns the first version's switched-off groups into switched-off events", () => {
    const migrated = normalizePrefs({ categories: { timer: false, completion: true, interface: false } })
    expect(migrated.events).toEqual({
      timerStart: { enabled: false },
      timerPause: { enabled: false },
      timerDone: { enabled: false },
      click: { enabled: false },
    })
  })

  it('persists across sessions and survives corrupt storage', () => {
    setPrefs({ volume: 0.2, profile: 'minimal', events: { success: { enabled: true, volume: 0.3 } } })
    resetPrefsCache()
    expect(getPrefs().volume).toBe(0.2)
    expect(getPrefs().profile).toBe('minimal')
    expect(getPrefs().events.success).toEqual({ enabled: true, volume: 0.3 })
    localStorage.setItem('lifetrack:interaction-prefs', '{nope')
    resetPrefsCache()
    expect(getPrefs()).toEqual(DEFAULT_PREFS)
  })
})

describe('cueForTarget', () => {
  const el = (html) => {
    const d = document.createElement('div')
    d.innerHTML = html
    document.body.append(d)
    return d.firstElementChild
  }
  afterEach(() => {
    document.body.innerHTML = ''
  })
  it('maps controls to cues', () => {
    expect(cueForTarget(el('<button>x</button>'))).toBe('click')
    expect(cueForTarget(el('<button role="switch" aria-checked="true"></button>'))).toBe('toggleOn')
    expect(cueForTarget(el('<button role="switch" aria-checked="false"></button>'))).toBe('toggleOff')
    expect(cueForTarget(el('<input type="checkbox" checked />'))).toBe('toggleOn')
    expect(cueForTarget(el('<a href="/planner">p</a>'))).toBe('navigate')
    expect(cueForTarget(el('<a href="https://x.dev">p</a>'))).toBe('click')
    expect(cueForTarget(el('<button role="tab">t</button>'))).toBe('select')
    expect(cueForTarget(el('<button data-sound="timerStart">go</button>'))).toBe('timerStart')
  })
  it('stays quiet for disabled controls, opt-outs and plain text', () => {
    expect(cueForTarget(el('<button disabled>x</button>'))).toBeNull()
    expect(cueForTarget(el('<div data-sound="off"><button>x</button></div>').firstElementChild)).toBeNull()
    expect(cueForTarget(el('<p>text</p>'))).toBeNull()
    expect(cueForTarget(el('<label><input type="checkbox"/> text</label>'))).toBeNull()
  })
  it('only names cues that exist', () => {
    for (const c of [
      'click',
      'navigate',
      'select',
      'toggleOn',
      'toggleOff',
      'open',
      'close',
      'check',
      'complete',
      'success',
      'error',
      'delete',
      'notify',
      'timerStart',
      'timerPause',
      'timerStop',
      'focusDone',
    ])
      expect(CUES[c], c).toBeTruthy()
  })
})

describe('SoundManager', () => {
  it('plays when unlocked and enabled', () => {
    sound.unlock()
    expect(sound.play('click')).toBe('click')
  })
  it('respects the master switch, mute, category and a hidden tab', () => {
    sound.unlock()
    setPrefs({ enabled: false })
    expect(sound.play('click')).toBeNull()
    setPrefs({ enabled: true, muted: true })
    at(2000)
    expect(sound.play('click')).toBeNull()
    setPrefs({ muted: false, events: { click: { enabled: false } } })
    at(3000)
    expect(sound.play('click')).toBeNull()
    expect(sound.play('success')).toBe('success')
    setPrefs({ events: { click: null } })
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    at(4000)
    expect(sound.play('click')).toBeNull()
    expect(sound.play('focusDone')).toBe('focusDone') // a finished focus block still sounds from a background tab
  })
  it('stays silent, without throwing, while the browser keeps audio locked', () => {
    window.AudioContext = class extends FakeAudioContext {
      state = 'suspended'
      resume() {
        return Promise.resolve()
      }
    }
    expect(sound.play('click')).toBeNull()
  })
  it('never overlaps: lower priority is dropped, equal or higher cuts in, same cue is rate-limited', () => {
    sound.unlock()
    expect(sound.play('complete')).toBe('goalFanfare') // the Productivity profile's richer celebration
    at(1050)
    expect(sound.play('click')).toBeNull() // lower priority while complete is still sounding
    expect(sound.play('error')).toBe('error') // higher priority cuts in
    at(1055)
    expect(sound.play('error')).toBeNull() // same cue again inside its gap
    at(5000)
    expect(sound.play('click')).toBe('click') // nothing sounding any more
  })
  it('a confirmed delete is heard as delete, even though the toast says success', () => {
    sound.unlock()
    sound.alias('success', 'delete')
    expect(sound.play('success')).toBe('delete')
    at(1100)
    expect(sound.play('success')).toBeNull() // the toast's own success is a repeat of the same cue
    at(9000)
    expect(sound.play('success')).toBe('success') // alias expired
  })
  it('previews even when the event is off, but never while muted', () => {
    sound.unlock()
    setPrefs({ events: { success: { enabled: false } } })
    expect(sound.play('success', { preview: true })).toBe('success')
    setPrefs({ muted: true })
    expect(sound.play('success', { preview: true })).toBeNull()
  })
  it('vibrates only when haptics are on and motion is allowed', () => {
    sound.unlock()
    navigator.vibrate = vi.fn(() => true)
    sound.play('check')
    expect(navigator.vibrate).toHaveBeenCalled()
    navigator.vibrate.mockClear()
    setPrefs({ haptics: false })
    at(5000)
    sound.play('check')
    expect(navigator.vibrate).not.toHaveBeenCalled()
    delete navigator.vibrate
  })
})

describe('InteractionProvider', () => {
  it('gives a button click a click cue, once', async () => {
    const play = vi.spyOn(sound, 'play')
    render(
      <InteractionProvider>
        <Button>Go</Button>
      </InteractionProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(play).toHaveBeenCalledTimes(1)
    expect(play).toHaveBeenCalledWith('click', { generic: true })
  })
  it('plays a switch as on / off from its new state', async () => {
    const play = vi.spyOn(sound, 'play')
    function Host() {
      const [on, setOn] = React.useState(false)
      return <Switch label="Dark" checked={on} onChange={setOn} />
    }
    render(
      <InteractionProvider>
        <Host />
      </InteractionProvider>,
    )
    await userEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(play).toHaveBeenLastCalledWith('toggleOn', { generic: true }))
    await userEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(play).toHaveBeenLastCalledWith('toggleOff', { generic: true }))
  })
  it('lets a specific cue replace the generic click', async () => {
    const play = vi.spyOn(sound, 'play')
    render(
      <InteractionProvider>
        <button onClick={() => sound.play('check')}>done</button>
      </InteractionProvider>,
    )
    await userEvent.click(screen.getByRole('button'))
    expect(play.mock.calls.map((c) => c[0])).toEqual(['check'])
  })
  it('sounds toasts by type, and not the ones already showing at mount', async () => {
    toast('old news', { id: 'old' })
    const play = vi.spyOn(sound, 'play')
    render(
      <InteractionProvider>
        <Toaster />
      </InteractionProvider>,
    )
    await act(async () => {})
    expect(play).not.toHaveBeenCalled()
    await act(async () => void toast.success('Saved'))
    await waitFor(() => expect(play).toHaveBeenLastCalledWith('success'))
    await act(async () => void toast.error('Nope'))
    await waitFor(() => expect(play).toHaveBeenLastCalledWith('error'))
    await act(async () => void toast('hello', { className: 'lt-arrival' }))
    await waitFor(() => expect(play).toHaveBeenLastCalledWith('notify'))
  })
  it('a successful action glows the pressed button once; a failure does not', async () => {
    const run = { ok: async () => {}, bad: async () => Promise.reject(new Error('x')) }
    function Host() {
      const [ok] = useAction(run.ok)
      const [bad] = useAction(run.bad)
      return (
        <>
          <Button onClick={() => ok()}>Save</Button>
          <Button onClick={() => bad()}>Fail</Button>
        </>
      )
    }
    render(
      <InteractionProvider>
        <Host />
      </InteractionProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Fail' }))
    expect(screen.getByRole('button', { name: 'Fail' })).not.toHaveClass('lt-saved')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('button', { name: 'Save' })).toHaveClass('lt-saved')
  })
})

describe('Sound & interaction settings', () => {
  it('toggles, sets volume and persists', async () => {
    render(
      <InteractionProvider>
        <SoundCard />
      </InteractionProvider>,
    )
    const master = screen.getByRole('switch', { name: 'Sound effects' })
    expect(master).toHaveAttribute('aria-checked', 'true')
    fireEvent.change(screen.getByRole('slider', { name: 'Master volume' }), { target: { value: '25' } })
    expect(getPrefs().volume).toBe(0.25)
    await userEvent.click(screen.getByRole('switch', { name: 'Notifications' }))
    expect(getPrefs().events.notification).toEqual({ enabled: false })
    await userEvent.click(screen.getByRole('button', { name: 'Mute' }))
    expect(getPrefs().muted).toBe(true)
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeInTheDocument()
    await userEvent.click(master)
    expect(getPrefs().enabled).toBe(false)
    expect(screen.getByRole('slider', { name: 'Master volume' })).toBeDisabled()
    resetPrefsCache()
    expect(getPrefs().volume).toBe(0.25) // still there after a reload
  })
  it('previews a sound on demand', async () => {
    const play = vi.spyOn(sound, 'play')
    render(<SoundCard />)
    await userEvent.click(screen.getByRole('button', { name: 'Preview Timer start' }))
    expect(play).toHaveBeenCalledWith('timerStart', expect.objectContaining({ preview: true }))
  })
})

describe('profiles', () => {
  it('every profile and event is complete, and every cue belongs to a real event', () => {
    for (const p of Object.values(PROFILES)) expect(Object.keys(p.events).sort()).toEqual(Object.keys(EVENTS).sort())
    for (const [k, c] of Object.entries(CUES)) expect(Object.keys(EVENTS), k).toContain(c.event)
    for (const e of Object.values(EVENTS)) expect(CUES[e.sample]).toBeTruthy()
    for (const p of Object.values(PROFILES)) for (const to of Object.values(p.variants)) expect(CUES[to]).toBeTruthy()
  })
  it('Silent plays nothing, Focus keeps the timer and errors but drops clicks', () => {
    sound.unlock()
    setPrefs({ profile: 'silent' })
    for (const [i, k] of ['click', 'check', 'error', 'timerStart'].entries()) {
      at(2000 + i * 1000)
      expect(sound.play(k)).toBeNull()
    }
    setPrefs({ profile: 'focus' })
    at(20000)
    expect(sound.play('click')).toBeNull()
    expect(sound.play('check')).toBeNull()
    expect(sound.play('timerStart')).toBe('timerStart')
    at(30000)
    expect(sound.play('error')).toBe('error')
  })
  it("a person's own switch beats the profile, and resetting an event returns to it", () => {
    sound.unlock()
    setPrefs({ profile: 'silent', events: { success: { enabled: true } } })
    expect(sound.play('success')).toBe('success')
    setPrefs({ events: { success: null } })
    at(5000)
    expect(sound.play('success')).toBeNull()
  })
  it('choosing a profile forgets the old overrides but keeps the master volume', () => {
    setPrefs({ volume: 0.3, events: { click: { enabled: false } } })
    setPrefs({ profile: 'minimal' })
    expect(getPrefs().events).toEqual({})
    expect(getPrefs().volume).toBe(0.3)
  })
  it('uses the focus profile while a focus block runs, unless that is switched off', () => {
    sound.unlock()
    setFocusActive(true)
    expect(sound.play('click')).toBeNull() // Focus profile: no clicks
    setPrefs({ autoFocus: false })
    at(5000)
    expect(sound.play('click')).toBe('click')
    setFocusActive(false)
  })
  it('scales loudness by the event: the same cue is quieter at a lower event volume', () => {
    sound.unlock()
    const gains = []
    const orig = sound.ctx.createGain
    sound.ctx.createGain = () => {
      const g = orig.call(sound.ctx)
      g.gain.setValueAtTime = (v) => gains.push(v)
      return g
    }
    sound.master.gain.setValueAtTime = (v) => gains.push(v)
    setPrefs({ events: { success: { volume: 1 } } })
    sound.play('success')
    at(5000)
    setPrefs({ events: { success: { volume: 0.25 } } })
    sound.play('success')
    const masters = gains.filter((g) => g > 0.001 && g < 2)
    expect(masters.length).toBeGreaterThan(1)
    expect(masters[0]).toBeGreaterThan(masters.find((g, i) => i > 0 && g !== masters[0]) ?? Infinity)
  })
  it('restores the defaults', () => {
    setPrefs({ volume: 0.9, profile: 'silent', haptics: false, events: { click: { volume: 0.1 } } })
    resetPrefs()
    expect(getPrefs()).toEqual(DEFAULT_PREFS)
  })
})

describe('Sound Studio', () => {
  it('chooses a profile, edits one event and restores the defaults', async () => {
    render(<SoundCard />)
    await userEvent.click(screen.getByRole('radio', { name: /Minimal/ }))
    expect(getPrefs().profile).toBe('minimal')
    await userEvent.click(screen.getByRole('switch', { name: 'Button clicks' }))
    expect(getPrefs().events.click).toEqual({ enabled: false })
    expect(screen.getByRole('button', { name: 'Reset Button clicks to the profile' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Restore defaults' }))
    expect(getPrefs()).toEqual(DEFAULT_PREFS)
  })
  it('previews a profile before it is chosen without choosing it', async () => {
    const play = vi.spyOn(sound, 'play')
    render(<SoundCard />)
    await userEvent.click(screen.getByRole('button', { name: 'Preview Minimal' }))
    expect(play).toHaveBeenCalledWith('check', expect.objectContaining({ preview: true, profile: 'minimal' }))
    expect(getPrefs().profile).toBe(DEFAULT_PREFS.profile)
  })
  it('lists the ten events, each with its own switch, volume and preview', () => {
    render(<SoundCard />)
    for (const e of Object.values(EVENTS)) {
      expect(screen.getByRole('switch', { name: e.label })).toBeInTheDocument()
      expect(screen.getByRole('slider', { name: `${e.label} volume` })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: `Preview ${e.label}` })).toBeInTheDocument()
    }
  })
})
