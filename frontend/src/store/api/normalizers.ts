import type { PaginatedResponse } from '@/types'

export function normalizePaginated<T>(response: any): PaginatedResponse<T> {
  if (response && Array.isArray(response.data)) {
    return {
      data: response.data,
      meta: { total: response.meta?.total ?? response.data.length },
    }
  }

  if (Array.isArray(response)) {
    return {
      data: response,
      meta: { total: response.length },
    }
  }

  return { data: [], meta: { total: 0 } }
}

export function normalizeSingle<T>(response: any): T {
  if (response && 'data' in response && response.data != null && !Array.isArray(response.data)) {
    return response.data as T
  }

  return response as T
}
