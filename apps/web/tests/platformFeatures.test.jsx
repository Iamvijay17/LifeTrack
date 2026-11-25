import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ConfirmProvider } from '@/components/shared/Confirm'

const svc = vi.hoisted(() => ({
  platformAvailable: vi.fn(() => true),
  isPlatformAdmin: vi.fn(),
  adminFlags: vi.fn(),
  createFlag: vi.fn(),
  updateFlag: vi.fn(),
  setFlagEnv: vi.fn(),
  archiveFlag: vi.fn(),
  flagHistory: vi.fn(),
  rollbackFlag: vi.fn(),
  setControls: vi.fn(),
  adminExperiments: vi.fn(),
  saveExperiment: vi.fn(),
  setExperimentStatus: vi.fn(),
  experimentResults: vi.fn(),
}))
vi.mock('@/services/platform', async (orig) => ({ ...(await orig()), ...svc }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() }, Toaster: () => null }))

const { default: FeaturesPage } = await import('@/features/features/FeaturesPage')
const open = () =>
  render(
    <MemoryRouter>
      <ConfirmProvider>
        <FeaturesPage />
      </ConfirmProvider>
    </MemoryRouter>,
  )
const env = (o = {}) => ({
  enabled: true,
  default_value: true,
  rollout_percent: 100,
  allow_users: [],
  block_users: [],
  roles: [],
  updated_at: new Date().toISOString(),
  ...o,
})
const flag = (o = {}) => ({
  key: 'module.insights',
  name: 'Insights',
  description: 'The Insights page',
  kind: 'release',
  module: 'insights',
  protected: false,
  archived: false,
  default_value: true,
  updated_at: new Date().toISOString(),
  envs: { development: env(), staging: env(), production: env() },
  ...o,
})
const data = (o = {}) => ({
  controls: { global_disable: false, experiments_disabled: false, disabled_modules: [], reason: '', updated_at: new Date().toISOString() },
  flags: [
    flag({ key: 'core.auth', name: 'Sign-in and sessions', protected: true, module: null, envs: {} }),
    flag(),
    flag({
      key: 'module.challenges',
      description: 'The goals page',
      name: 'Challenges',
      module: 'challenges',
      envs: { production: env({ rollout_percent: 25 }), development: env(), staging: env() },
    }),
    flag({
      key: 'exp.card',
      name: 'New card',
      kind: 'experiment',
      module: null,
      envs: { production: env({ enabled: false }), development: env({ enabled: false }), staging: env({ enabled: false }) },
    }),
  ],
  ...o,
})

beforeEach(() => {
  Object.values(svc).forEach((f) => f.mockReset?.())
  svc.platformAvailable.mockReturnValue(true)
  svc.isPlatformAdmin.mockResolvedValue(true)
  svc.adminFlags.mockResolvedValue(data())
  svc.flagHistory.mockResolvedValue({ total: 0, items: [] })
  svc.adminExperiments.mockResolvedValue([])
  svc.setFlagEnv.mockResolvedValue({})
})

describe('Feature Management: access', () => {
  it('shows nothing to people who are not administrators, and never loads the configuration', async () => {
    svc.isPlatformAdmin.mockResolvedValue(false)
    open()
    expect(await screen.findByText('Administrator access required')).toBeInTheDocument()
    expect(svc.adminFlags).not.toHaveBeenCalled()
  })
  it('explains itself when there is no Supabase project', async () => {
    svc.platformAvailable.mockReturnValue(false)
    open()
    expect(await screen.findByText(/Needs a Supabase project|not available in demo/i)).toBeInTheDocument()
    expect(svc.adminFlags).not.toHaveBeenCalled()
  })
})

describe('Feature Management: flags', () => {
  it('lists flags with their state in the chosen environment, and searches and filters them', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByTestId('flag-module.challenges')
    await user.click(screen.getByRole('tab', { name: 'production' }))
    const row = screen.getByTestId('flag-module.challenges')
    expect(within(row).getByText('25% rollout')).toBeInTheDocument()
    expect(within(screen.getByTestId('flag-core.auth')).getByText('Always on')).toBeInTheDocument()
    expect(within(screen.getByTestId('flag-exp.card')).getByText('Off')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Search flags'), 'insights')
    expect(screen.queryByTestId('flag-module.challenges')).toBeNull()
    expect(screen.getByTestId('flag-module.insights')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Search flags'))
    await user.click(screen.getByLabelText('Kind'))
    await user.click(await screen.findByRole('option', { name: 'Experiment' }))
    expect(screen.queryByTestId('flag-module.insights')).toBeNull()
    expect(screen.getByTestId('flag-exp.card')).toBeInTheDocument()
  })
  it('the environment selector changes what the rows say', async () => {
    const user = userEvent.setup()
    open()
    const row = await screen.findByTestId('flag-module.challenges')
    await user.click(screen.getByRole('tab', { name: 'development' }))
    expect(within(row).queryByText('25% rollout')).toBeNull()
    expect(within(row).getByText('On')).toBeInTheDocument()
  })
  it('turning a flag off asks first, says what it does, and only then writes', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByTestId('flag-module.insights')
    await user.click(screen.getByRole('tab', { name: 'production' }))
    await user.click(screen.getByRole('switch', { name: 'Insights in production' }))
    expect(await screen.findByText(/Turn off “Insights” in production\?/)).toBeInTheDocument()
    expect(svc.setFlagEnv).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Turn off' }))
    await waitFor(() => expect(svc.setFlagEnv).toHaveBeenCalledWith('module.insights', 'production', { enabled: false }, 'Turned off'))
  })
  it('declining the confirmation changes nothing', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByTestId('flag-module.insights')
    await user.click(screen.getByRole('tab', { name: 'production' }))
    await user.click(screen.getByRole('switch', { name: 'Insights in production' }))
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(svc.setFlagEnv).not.toHaveBeenCalled()
  })
  it('protected flags can not be toggled and say why', async () => {
    const user = userEvent.setup()
    open()
    const row = await screen.findByTestId('flag-core.auth')
    await user.click(within(row).getByRole('switch'))
    expect(screen.queryByText(/Turn off/)).toBeNull()
    expect(svc.setFlagEnv).not.toHaveBeenCalled()
    await user.click(within(row).getByRole('button', { name: /Open Sign-in/ }))
    expect(await screen.findByTestId('protected-note')).toHaveTextContent(/no flag, emergency control or experiment can switch it off/)
    expect(screen.queryByRole('button', { name: /Save .* settings/ })).toBeNull()
  })
  it('targeting: validates before saving and sends the whole environment config with a reason', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByTestId('flag-module.challenges')
    await user.click(screen.getByRole('tab', { name: 'production' }))
    await user.click(await screen.findByRole('button', { name: 'Open Challenges' }))
    const dlg = await screen.findByRole('dialog')
    await user.type(within(dlg).getByLabelText(/Always on for/), 'not-a-uuid')
    expect(within(dlg).getByRole('alert')).toHaveTextContent(/user ids/)
    expect(within(dlg).getByRole('button', { name: /Save .* settings/ })).toBeDisabled()
    await user.clear(within(dlg).getByLabelText(/Always on for/))
    await user.type(within(dlg).getByLabelText('Reason (shown in the history)'), 'widen')
    await user.click(within(dlg).getByRole('button', { name: /Save .* settings/ }))
    const confirm = await screen.findByText('Apply to production?')
    expect(confirm).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(svc.setFlagEnv).toHaveBeenCalled())
    expect(svc.setFlagEnv.mock.calls[0]).toEqual([
      'module.challenges',
      'production',
      { enabled: true, default_value: true, rollout_percent: 25, roles: [], allow_users: [], block_users: [] },
      'widen',
    ])
  })
  it('creating a flag validates the key first', async () => {
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('button', { name: /New flag/ }))
    const dlg = await screen.findByRole('dialog')
    await user.type(within(dlg).getByLabelText('Key'), 'core.mine')
    await user.type(within(dlg).getByLabelText('Name'), 'Mine')
    expect(within(dlg).getByRole('alert')).toHaveTextContent(/reserved/)
    expect(within(dlg).getByRole('button', { name: 'Create flag' })).toBeDisabled()
  })
})

describe('Feature Management: emergency controls and history', () => {
  it('requires a reason, asks to confirm, and lists what can never be switched off', async () => {
    const user = userEvent.setup()
    svc.setControls.mockResolvedValue({})
    open()
    await user.click(await screen.findByRole('tab', { name: 'Emergency controls' }))
    expect(screen.getByText('Never switched off')).toBeInTheDocument()
    for (const n of ['Sign-in and sessions', 'Security and privacy', 'Data integrity', 'Backup and recovery'])
      expect(screen.getAllByText(n).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('switch', { name: 'Stop all experiments' }))
    expect(svc.setControls).not.toHaveBeenCalled() // no reason yet
    await user.type(screen.getByLabelText('Reason'), 'checkout bug')
    await user.click(screen.getByRole('switch', { name: 'Stop all experiments' }))
    await user.click(await screen.findByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(svc.setControls).toHaveBeenCalledWith({ experiments_disabled: true }, 'checkout bug'))
  })
  it('shows a banner while controls are active', async () => {
    svc.adminFlags.mockResolvedValue(
      data({
        controls: {
          global_disable: false,
          experiments_disabled: true,
          disabled_modules: ['insights'],
          reason: 'drill',
          updated_at: new Date().toISOString(),
        },
      }),
    )
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('tab', { name: 'Emergency controls' }))
    expect(await screen.findByTestId('controls-active')).toHaveTextContent('drill')
  })
  it('history shows before → after and offers a confirmed rollback', async () => {
    const user = userEvent.setup()
    svc.flagHistory.mockResolvedValue({
      total: 1,
      items: [
        {
          id: 7,
          scope: 'flag',
          ref_key: 'module.insights',
          env: 'production',
          at: new Date().toISOString(),
          action: 'env_set',
          actor: 'admin@example.com',
          reason: 'bad deploy',
          before: { enabled: true, rollout_percent: 100 },
          after: { enabled: false, rollout_percent: 100 },
        },
      ],
    })
    svc.rollbackFlag.mockResolvedValue({})
    open()
    await user.click(await screen.findByRole('tab', { name: 'History' }))
    const row = await screen.findByTestId('history-7')
    expect(row).toHaveTextContent('enabled: true → false')
    expect(row).toHaveTextContent('admin@example.com')
    expect(row).toHaveTextContent('bad deploy')
    await user.click(within(row).getByRole('button', { name: /Roll back/ }))
    await user.click(await screen.findByRole('button', { name: 'Roll back' }))
    await waitFor(() => expect(svc.rollbackFlag).toHaveBeenCalledWith(7))
  })
})

describe('Feature Management: experiments', () => {
  const exp = {
    key: 'checkout',
    flag_key: 'exp.card',
    name: 'Checkout copy',
    hypothesis: 'Shorter wins',
    status: 'running',
    traffic_percent: 50,
    variants: [
      { key: 'control', weight: 50 },
      { key: 'treatment', weight: 50 },
    ],
    primary_event: 'purchased',
    started_at: new Date().toISOString(),
    participants: 60,
  }
  it('is empty by default and drafts are not running', async () => {
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('tab', { name: 'Experiments' }))
    expect(await screen.findByText('No experiments yet')).toBeInTheDocument()
  })
  it('says "not enough data" and makes no significance claim for a small sample', async () => {
    const user = userEvent.setup()
    svc.adminExperiments.mockResolvedValue([exp])
    svc.experimentResults.mockResolvedValue({
      key: 'checkout',
      status: 'running',
      primary_event: 'purchased',
      variants: exp.variants,
      rows: [
        { variant: 'control', participants: 30, conversions: 3 },
        { variant: 'treatment', participants: 30, conversions: 9 },
      ],
      daily: [],
    })
    open()
    await user.click(await screen.findByRole('tab', { name: 'Experiments' }))
    await user.click(await screen.findByRole('button', { name: 'Results' }))
    const res = await screen.findByTestId('experiment-results')
    expect(res).toHaveTextContent('Not enough data yet')
    expect(res.textContent.toLowerCase()).not.toMatch(/significan|winner|confident|p-value/)
    expect(res).toHaveTextContent('+20.0 points')
  })
  it('with a large sample it shows rates with ranges and still declares no winner', async () => {
    const user = userEvent.setup()
    svc.adminExperiments.mockResolvedValue([exp])
    svc.experimentResults.mockResolvedValue({
      key: 'checkout',
      status: 'running',
      primary_event: 'purchased',
      variants: exp.variants,
      rows: [
        { variant: 'control', participants: 1000, conversions: 100 },
        { variant: 'treatment', participants: 1000, conversions: 130 },
      ],
      daily: [],
    })
    open()
    await user.click(await screen.findByRole('tab', { name: 'Experiments' }))
    await user.click(await screen.findByRole('button', { name: 'Results' }))
    const res = await screen.findByTestId('experiment-results')
    expect(res).toHaveTextContent('does not declare a winner')
    expect(res).toHaveTextContent('10.0%')
    expect(res).toHaveTextContent('13.0%')
  })
  it('starting asks for confirmation and an experiment in draft can be edited', async () => {
    const user = userEvent.setup()
    svc.adminExperiments.mockResolvedValue([{ ...exp, status: 'draft', participants: 0, started_at: null }])
    svc.setExperimentStatus.mockResolvedValue({})
    open()
    await user.click(await screen.findByRole('tab', { name: 'Experiments' }))
    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Start/ }))
    expect(await screen.findByText(/Start “Checkout copy”\?/)).toBeInTheDocument()
    expect(svc.setExperimentStatus).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Start' }))
    await waitFor(() => expect(svc.setExperimentStatus).toHaveBeenCalledWith('checkout', 'running', 'Start'))
  })
  it('the experiment form rejects weights that do not add up and needs an experiment flag', async () => {
    const user = userEvent.setup()
    open()
    await user.click(await screen.findByRole('tab', { name: 'Experiments' }))
    await user.click(await screen.findByRole('button', { name: /New experiment/ }))
    const dlg = await screen.findByRole('dialog')
    await user.clear(within(dlg).getByLabelText(/Treatment %/))
    await user.type(within(dlg).getByLabelText(/Treatment %/), '100')
    expect(within(dlg).getByRole('alert')).toBeInTheDocument()
    expect(within(dlg).getByRole('button', { name: 'Save draft' })).toBeDisabled()
  })
})
