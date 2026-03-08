import type { PaginatedResponse } from '@/types'

export function normalizePaginated<T>(response: any): PaginatedResponse<T> {
  if (response && Array.isArray(response.data)) {
    return {
      data: response.data,
      meta: response.meta ?? { page: 1, limit: 20, total: response.data.length, totalPages: 1 },
    }
  }

  if (Array.isArray(response)) {
    return {
      data: response,
      meta: { page: 1, limit: response.length, total: response.length, totalPages: 1 },
    }
  }

  return { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }
}

export function normalizeSingle<T>(response: any): T {
  if (response && 'data' in response && response.data != null && !Array.isArray(response.data)) {
    return response.data as T
  }

  return response as T
}
