import type { BaseQueryFn } from '@reduxjs/toolkit/query'
import type { AxiosRequestConfig, Method } from 'axios'

import api from '@/services/api'

export interface BaseQueryArgs {
  url: string
  method?: Method
  data?: unknown
  body?: unknown
  params?: Record<string, unknown>
  headers?: Record<string, string>
}

export const axiosBaseQuery = (): BaseQueryFn<BaseQueryArgs, unknown, { status?: number; data: string }> =>
  async ({ url, method = 'GET', data, body, params, headers }) => {
    try {
      const config: AxiosRequestConfig = { url, method, data: data ?? body, params, headers }
      const result = await api(config)
      return { data: result.data }
    } catch (err: any) {
      return {
        error: {
          status: err.response?.status,
          data: err.response?.data?.message ?? err.message ?? 'Unknown error',
        },
      }
    }
  }
