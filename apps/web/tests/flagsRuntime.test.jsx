import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'

const h = vi.hoisted(() => ({ supabase: { rpc: vi.fn() }, session: { user: { id: 'u1' } } }))
vi.mock('@/lib/supabase', () => ({ supabase: h.supabase, isSupabaseConfigured: true, createVerifierClient: () => null }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ session: h.session }) }))
vi.mock('@/services/demo', async (o) => ({ ...(await o()), isDemo: () => false }))
vi.mock('@lifetrack/data', async (o) => ({ ...(await o()), getUserId: () => 'u1' }))

const flags = await import('@/services/flags')
const { FlagGate, FlagsProvider, useDisabledModules, useExperiment, useFlag } = await import('@/hooks/useFlags')
const { arrangeNav } = await import('@/lib/nav')

const server = (map, extra = {}) =>
  h.supabase.rpc.mockImplementation(async (name) =>
    name === 'evaluate_flags' ? { data: { flags: map, killed: false, version: 'v1', ...extra }, error: null } : { data: null, error: null },
  )
beforeEach(() => {
  h.supabase.rpc.mockReset()
  flags.invalidateFlags()
})
afterEach(() => flags.invalidateFlags())

describe('flag service', () => {
  it('fetches every flag in ONE call and serves later reads from the cache', async () => {
    server({ 'module.insights': false })
    const a = await flags.loadFlags()
    await flags.loadFlags()
    await flags.loadFlags()
    expect(h.supabase.rpc).toHaveBeenCalledTimes(1)
    expect(a.source).toBe('server')
    expect(a.flags['module.insights']).toBe(false)
    expect(a.flags['module.automation']).toBe(true) // anything the server did not mention keeps its code default
  })
  it('invalidation after an admin change makes the next read fetch again', async () => {
    server({ 'module.insights': true })
    await flags.loadFlags()
    server({ 'module.insights': false })
    flags.invalidateFlags()
    expect((await flags.loadFlags()).flags['module.insights']).toBe(false)
    expect(h.supabase.rpc).toHaveBeenCalledTimes(2)
  })
  it('falls back to the last answer when the server fails, and to code defaults when there never was one', async () => {
    h.supabase.rpc.mockResolvedValue({ data: null, error: { message: 'down' } })
    const first = await flags.loadFlags()
    expect(first.source).toBe('defaults')
    expect(first.flags['module.insights']).toBe(true) // behaviour as before flags existed
    server({ 'module.insights': false })
    await flags.loadFlags({ force: true })
    h.supabase.rpc.mockRejectedValue(new Error('network'))
    const stale = await flags.loadFlags({ force: true })
    expect(stale.flags['module.insights']).toBe(false)
    expect(stale.source).toBe('server')
  })
  it('experiment assignment: control on any failure, and the answer is cached', async () => {
    h.supabase.rpc.mockResolvedValue({ data: null, error: { message: 'no such function' } })
    expect(await flags.assignExperiment('x')).toEqual({ variant: 'control', enrolled: false })
    h.supabase.rpc.mockReset()
    flags.invalidateFlags()
    h.supabase.rpc.mockResolvedValue({ data: { variant: 'treatment', enrolled: true }, error: null })
    expect((await flags.assignExperiment('y')).variant).toBe('treatment')
    await flags.assignExperiment('y')
    expect(h.supabase.rpc).toHaveBeenCalledTimes(1)
    h.supabase.rpc.mockRejectedValue(new Error('x'))
    expect(await flags.trackConversion('y', 'bought')).toBe(false) // never throws
  })
})

describe('provider, hooks and gates', () => {
  const Probe = () => {
    const insights = useFlag('module.insights')
    const off = useDisabledModules()
    return (
      <p>
        insights:{String(insights)} off:{[...off].join(',')}
      </p>
    )
  }
  it('renders the code default first, then the server value; hides a disabled module from the menu logic', async () => {
    server({ 'module.insights': false })
    render(
      <FlagsProvider>
        <Probe />
      </FlagsProvider>,
    )
    expect(screen.getByText(/insights:true/)).toBeInTheDocument() // no flicker off while loading
    await waitFor(() => expect(screen.getByText(/insights:false off:insights/)).toBeInTheDocument())
  })
  it('FlagGate explains instead of showing the page, and shows it when on', async () => {
    server({ 'module.insights': false })
    const { unmount } = render(
      <FlagsProvider>
        <FlagGate flag="module.insights">
          <p>the page</p>
        </FlagGate>
      </FlagsProvider>,
    )
    expect(await screen.findByText('This feature is switched off for now')).toBeInTheDocument()
    expect(screen.queryByText('the page')).toBeNull()
    unmount()
    flags.invalidateFlags()
    server({ 'module.insights': true })
    render(
      <FlagsProvider>
        <FlagGate flag="module.insights">
          <p>the page</p>
        </FlagGate>
      </FlagsProvider>,
    )
    expect(await screen.findByText('the page')).toBeInTheDocument()
  })
  it('useExperiment: control until the server says otherwise; convert only when enrolled', async () => {
    h.supabase.rpc.mockImplementation(async (name) => {
      if (name === 'evaluate_flags') return { data: { flags: {}, killed: false }, error: null }
      if (name === 'experiment_assign') return { data: { variant: 'treatment', enrolled: true }, error: null }
      if (name === 'experiment_convert') return { data: true, error: null }
      return { data: null, error: null }
    })
    let api
    const Exp = () => {
      api = useExperiment('checkout')
      return <p>variant:{api.variant}</p>
    }
    render(
      <FlagsProvider>
        <Exp />
      </FlagsProvider>,
    )
    expect(screen.getByText('variant:control')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('variant:treatment')).toBeInTheDocument())
    let ok
    await act(async () => {
      ok = await api.convert('purchased')
    })
    expect(ok).toBe(true)
    expect(h.supabase.rpc).toHaveBeenCalledWith('experiment_convert', { p_key: 'checkout', p_event: 'purchased' })
  })
})

describe('navigation', () => {
  it('a disabled module disappears from the menu; System pages stay admin-only', () => {
    const all = arrangeNav({}, { admin: true }).groups.flatMap((g) => g.items.map((i) => i.to))
    expect(all).toContain('/insights')
    expect(all).toContain('/features')
    const trimmed = arrangeNav({}, { admin: true, off: new Set(['insights', 'automation']) }).groups.flatMap((g) =>
      g.items.map((i) => i.to),
    )
    expect(trimmed).not.toContain('/insights')
    expect(trimmed).not.toContain('/automation')
    expect(trimmed).toContain('/features')
    expect(arrangeNav({}, { admin: false }).groups.flatMap((g) => g.items.map((i) => i.to))).not.toContain('/features')
    const once = arrangeNav({}, { admin: true })
      .groups.flatMap((g) => g.items.map((i) => i.to))
      .filter((t) => t === '/features')
    expect(once).toHaveLength(1) // no duplicate entry
  })
})
