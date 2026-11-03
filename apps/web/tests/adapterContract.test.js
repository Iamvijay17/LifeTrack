import { beforeEach, describe, expect, it } from 'vitest'
import { adapterContract } from '@lifetrack/data/testing/adapterContract'
import { localAdapter } from '@/services/localAdapter'
import { setUserId } from '@/services/session'

// The dev/e2e backend must behave like production for everything the app relies on.
adapterContract({ describe, it, expect, beforeEach }, 'localAdapter (web dev backend)', async () => ({
  adapter: localAdapter, as: setUserId, reset: async () => { localStorage.clear() },
}))
