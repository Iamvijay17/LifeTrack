import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { render } from '@testing-library/react'
import App from '@/App'
import { freshBackend, signedInUser } from './components/helpers'

vi.setConfig({ testTimeout: 60_000 })

let search
const Where = () => {
  search = useLocation().search
  return null
}

beforeEach(async () => {
  await freshBackend()
  await signedInUser()
})

// Regression: the Command Center's "Create habit" link (?new=1) used to wipe every other query parameter when it dropped the flag.
describe('Habits ?new=1 deep link', () => {
  it('opens the new-habit form once and keeps the selected view', async () => {
    render(
      <MemoryRouter initialEntries={['/habits?view=consistency&new=1']}>
        <App />
        <Where />
      </MemoryRouter>,
    )
    await screen.findByRole('dialog', {}, { timeout: 40_000 })
    await waitFor(() => expect(search).toBe('?view=consistency'))
  })
})
