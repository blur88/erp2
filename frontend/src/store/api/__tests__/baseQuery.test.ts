import { describe, expect, it, vi } from 'vitest'

import api from '@/services/api'
import { axiosBaseQuery } from '@/store/api/baseQuery'

vi.mock('@/services/api', () => ({
  default: vi.fn(),
}))

describe('axiosBaseQuery', () => {
  it('returns data on success', async () => {
    vi.mocked(api).mockResolvedValueOnce({ data: { ok: true } })

    const baseQuery = axiosBaseQuery()
    const result = await baseQuery({ url: '/inventory/products' }, {} as never, {} as never)

    expect(api).toHaveBeenCalledWith({
      url: '/inventory/products',
      method: 'GET',
      data: undefined,
      params: undefined,
      headers: undefined,
    })
    expect(result).toEqual({ data: { ok: true } })
  })

  it('returns normalized error on failure', async () => {
    vi.mocked(api).mockRejectedValueOnce({
      message: 'Request failed',
      response: {
        status: 400,
        data: { message: 'Bad request' },
      },
    })

    const baseQuery = axiosBaseQuery()
    const result = await baseQuery({ url: '/inventory/products' }, {} as never, {} as never)

    expect(result).toEqual({
      error: {
        status: 400,
        data: 'Bad request',
      },
    })
  })
})
