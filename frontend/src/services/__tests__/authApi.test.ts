import { expect, it, vi } from 'vitest'
import { authApi } from '../authApi'

const mocks = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('axios', () => ({
  default: {
    create: () => ({ post: mocks.post, interceptors: { request: { use: vi.fn() } } }),
  },
}))

it('sets a 10-second timeout on the refresh POST', async () => {
  mocks.post.mockResolvedValueOnce({ data: {} })
  await authApi.refreshToken('refresh-token')
  expect(mocks.post).toHaveBeenCalledWith('/auth/refresh', { refreshToken: 'refresh-token' }, { timeout: 10000 })
})
