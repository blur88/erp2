import { it, expect, vi } from 'vitest'
vi.mock('@/store', () => ({ persistor: {} }))
it('loads', async () => {
  expect(
    (await import('@/components/common/SidebarUserMenu')).default,
  ).toBeDefined()
})
