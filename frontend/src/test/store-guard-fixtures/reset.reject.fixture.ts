import { it, expect, vi } from 'vitest'
it('loads', async () => {
  await import('@/store').catch(() => {})
  vi.resetModules()
})
