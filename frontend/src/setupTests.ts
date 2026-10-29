import { afterAll, afterEach, beforeAll } from 'vitest'

import { server } from '@/mocks/server'

// MSW 3 names the unhandled-request policy onUnhandledFrame.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
