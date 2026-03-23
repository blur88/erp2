import { describe, expect, it } from 'vitest'

import { server } from '@/mocks/server'
import { handlers } from '@/mocks/handlers'

describe('mocks setup', () => {
  it('exports an MSW server instance', () => {
    expect(server).toBeDefined()
    expect(typeof server.listen).toBe('function')
    expect(typeof server.resetHandlers).toBe('function')
    expect(typeof server.close).toBe('function')
  })

  it('exports handlers array', () => {
    expect(Array.isArray(handlers)).toBe(true)
    expect(handlers.length).toBeGreaterThan(0)
  })
})
