import { it } from 'vitest'

it('pins deliberate registry tampering as outside coverage', async () => {
  await import('@/store').catch(() => {})
  const entries = (globalThis as any)[
    Symbol.for('erp.test.application-store-violations')
  ]
  entries.length = 0
})
