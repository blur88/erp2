import { it, expect, vi } from 'vitest'
it('loads', async () => {
  await vi.importActual('@/store')
})
