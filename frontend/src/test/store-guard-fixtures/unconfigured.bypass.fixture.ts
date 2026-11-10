import { store, sessionReady } from '@/store'
import { sessionCoordinator } from '@/services/session'
import { STORAGE_UNAVAILABLE } from '@/services/session/coordinator'
import { expect, it } from 'vitest'

// This deliberate guard bypass evaluates the real store without browser storage.
// Consume its expected startup failure, as main.tsx does for the actual app.
const startup = sessionReady.then(() => null, error => error)
it('pins running without the configured plugin as outside coverage', async () => {
  expect(store.getState).toBeTypeOf('function')
  expect((await startup).message).toBe(STORAGE_UNAVAILABLE)
  sessionCoordinator.dispose()
})
