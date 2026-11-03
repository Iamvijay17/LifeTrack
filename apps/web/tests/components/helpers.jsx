import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App'
import { auth } from '@/services/auth'
import { db } from '@/services/db'
import { resetStore } from '@/hooks/store'
import { setUserId } from '@/services/session'

/** Fresh dev backend (localStorage) + empty in-memory store for each test. */
export async function freshBackend() {
  localStorage.clear()
  resetStore()
  setUserId(null)
  window.__ltUser = null
}

/** Signs up a dev user (the same local stand-in for Supabase Auth the e2e suite uses) and returns the session. */
export async function signedInUser(email = 'ann@example.com', name = 'Ann') {
  await auth.signUp(email, 'secret123', name)
  const s = await auth.getSession()
  setUserId(s.user.id)
  return s
}

export const renderApp = (path = '/') => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
export { db }
