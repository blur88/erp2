import { describe, expect, it } from 'vitest'

import { normalizePaginated, normalizeSingle } from '@/store/api/normalizers'

describe('normalizePaginated', () => {
  it('normalizes paginated payloads', () => {
    const result = normalizePaginated<{ id: string }>({
      data: [{ id: '1' }],
      meta: { page: 2, limit: 10, total: 15, totalPages: 2 },
    })

    expect(result.data).toEqual([{ id: '1' }])
    expect(result.meta).toEqual({ page: 2, limit: 10, total: 15, totalPages: 2 })
  })

  it('normalizes plain array payloads', () => {
    const result = normalizePaginated<{ id: string }>([{ id: '2' }])

    expect(result.data).toEqual([{ id: '2' }])
    expect(result.meta).toEqual({ page: 1, limit: 1, total: 1, totalPages: 1 })
  })

  it('returns empty fallback for invalid payloads', () => {
    const result = normalizePaginated<{ id: string }>({})

    expect(result.data).toEqual([])
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 })
  })
})

describe('normalizeSingle', () => {
  it('unwraps { data } payloads', () => {
    const result = normalizeSingle<{ id: string }>({ data: { id: '1' } })
    expect(result).toEqual({ id: '1' })
  })

  it('does not unwrap null data payloads', () => {
    const response = { data: null, fallback: true }
    const result = normalizeSingle<typeof response>(response)
    expect(result).toEqual(response)
  })

  it('returns plain payloads unchanged', () => {
    const result = normalizeSingle<{ id: string }>({ id: '2' })
    expect(result).toEqual({ id: '2' })
  })
})
