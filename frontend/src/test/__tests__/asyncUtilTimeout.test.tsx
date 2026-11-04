import { getConfig } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

// Guards the configuration in src/test/setup.ts. This does not reproduce the
// #1560 flake, which needs a loaded machine; it fails if the shared wait limit
// is removed or lowered, which would bring that flake back under load.
describe('Testing Library async wait limit', () => {
  it('is 5000ms for every jsdom test', () => {
    expect(getConfig().asyncUtilTimeout).toBe(5000)
  })
})
