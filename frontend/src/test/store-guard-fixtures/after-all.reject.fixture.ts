import { afterAll, it } from 'vitest'

it('finishes before the violation', () => {})
afterAll(async () => {
  await import('@/store').catch(() => {})
})
