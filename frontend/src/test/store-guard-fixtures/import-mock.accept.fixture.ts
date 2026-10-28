import { it, expect, vi } from 'vitest'
vi.mock('@/store', () => ({ store: {} }))
import { store } from '@/store'
it('loads', async () => {
  expect(store).toEqual({})
  expect((await vi.importMock<any>('@/store')).store).toEqual({})
})
