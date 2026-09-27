import { describe, expect, it } from 'vitest'

// Canary for #1308: `.test.ts` files run under the `node` project. If the
// environment routing is ever silently ignored again (as `environmentMatchGlobs`
// was on Vitest 5), every `.test.ts` falls back to jsdom and this fails.
describe('test environment routing', () => {
  it('runs .test.ts files without a DOM', () => {
    expect(typeof window).toBe('undefined')
    expect(typeof document).toBe('undefined')
  })
})
