import { afterAll, afterEach, beforeAll } from 'vitest'

import { server } from '@/mocks/server'
import { recordUnhandledRequest, reportUnhandledRequests } from '@/mocks/unhandledRequests'

// MSW 3.0.1 callback defaults.error() only logs; retain the built-in policy
// to reject requests, and record through the unhandled-request lifecycle event.
server.events.on('request:unhandled', ({ request }) => recordUnhandledRequest(request))
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(reportUnhandledRequests)
afterAll(reportUnhandledRequests)
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
