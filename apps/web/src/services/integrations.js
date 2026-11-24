// The browser's side of the Integration Center. Everything goes through the `google-integration` Edge Function: the app never sees a Google token, and
// never talks to Google itself. Without a Supabase project (the in-browser dev backend) there is nothing to connect to, and this says so.
import { supabase } from '@/lib/supabase'
import { AppError } from './errors'
import { isDemo } from './demo'

export const PROVIDERS = {
  google_calendar: {
    key: 'google_calendar',
    name: 'Google Calendar',
    blurb: 'Two-way sync of your events. Nothing is deleted, and a change made in both places waits for your decision.',
    permissions: [
      'See and edit events on your calendars',
      'See the list of your calendars (to pick one)',
      'See which Google account is connected',
    ],
  },
  google_drive: {
    key: 'google_drive',
    name: 'Google Drive',
    blurb: 'Save backups of your LifeTrack data to a folder in your Drive, only when you press the button.',
    permissions: [
      'Create and open only the files LifeTrack makes (a "LifeTrack Backups" folder). It cannot see anything else in your Drive.',
      'See which Google account is connected',
    ],
  },
}

async function call(body) {
  if (isDemo()) throw new AppError('Integrations are not available in demo mode: they would act on your real Google account.')
  if (!supabase)
    throw new AppError('Integrations need a LifeTrack account on a Supabase project. They are not available in the in-browser dev mode.')
  const { data, error } = await supabase.functions.invoke('google-integration', { body })
  if (error) {
    // A non-2xx answer: its JSON body carries a short message we wrote; anything else (network, not deployed, blocked by CORS) is "unreachable".
    const res = error.context
    if (res && typeof res.json === 'function') {
      const j = await res.json().catch(() => null)
      throw Object.assign(new AppError(j?.message ?? 'The integration service could not do that.'), { code: j?.error })
    }
    throw Object.assign(new AppError('The integration service is not reachable. It may not be deployed yet (see docs/INTEGRATIONS.md).'), {
      code: 'unreachable',
    })
  }
  return data
}

export const integrations = {
  capabilities: () => call({ action: 'capabilities' }),
  /** The Google consent page to send the browser to. */
  start: async (provider) => (await call({ action: 'start', provider })).url,
  disconnect: (provider) => call({ action: 'disconnect', provider }),
  calendars: async () => (await call({ action: 'calendars', provider: 'google_calendar' })).calendars,
  syncCalendar: (calendarId, resolutions) => call({ action: 'calendar-sync', provider: 'google_calendar', calendarId, resolutions }),
  backup: async (text) => (await call({ action: 'drive-backup', provider: 'google_drive', text })).file,
  backups: async () => (await call({ action: 'drive-list', provider: 'google_drive' })).files,
  downloadBackup: async (fileId) => (await call({ action: 'drive-download', provider: 'google_drive', fileId })).text,
}
