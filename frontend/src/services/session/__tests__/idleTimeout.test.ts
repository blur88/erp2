import { describe, expect, it } from 'vitest'
import { SESSION_IDLE_TIMEOUT } from '../coordinator'
import { resolveIdleTimeout } from '../idleTimeout'

describe('resolveIdleTimeout', () => {
  it('uses the 12-hour default when the runtime key is absent or invalid', () => {
    expect(resolveIdleTimeout({})).toBe(SESSION_IDLE_TIMEOUT)
    expect(resolveIdleTimeout({ SESSION_IDLE_TIMEOUT_MS: 'invalid' })).toBe(SESSION_IDLE_TIMEOUT)
  })

  it('uses a positive runtime override', () => {
    expect(resolveIdleTimeout({ SESSION_IDLE_TIMEOUT_MS: 120000 })).toBe(120000)
  })
})
