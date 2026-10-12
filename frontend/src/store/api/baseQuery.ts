import type { BaseQueryFn } from '@reduxjs/toolkit/query'
import type { AxiosRequestConfig, Method } from 'axios'

import api from '@/services/api'
import type { CompanySettingsFailureCause } from './companySettingsFailure'

export interface BaseQueryArgs {
  url: string
  method?: Method
  data?: unknown
  body?: unknown
  params?: Record<string, unknown>
  headers?: Record<string, string>
}

/**
 * `cause` is the class the endpoint's `queryFn` read off the raw error, kept
 * alongside the flattened status because the flattening loses which request an
 * error belonged to. `QueryError.data` stays a string, so every other consumer
 * is unaffected.
 */
export interface QueryError {
  status?: number
  data: string
  cause?: CompanySettingsFailureCause
}

export const toQueryError = (err: any): QueryError => ({
  status: err.response?.status,
  data: err.response?.data?.message ?? err.message ?? 'Unknown error',
})

export const axiosBaseQuery = (): BaseQueryFn<BaseQueryArgs, unknown, QueryError> =>
  async ({ url, method = 'GET', data, body, params, headers }) => {
    try {
      const config: AxiosRequestConfig = { url, method, data: data ?? body, params, headers }
      const result = await api(config)
      return { data: result.data }
    } catch (err: any) {
      return { error: toQueryError(err) }
    }
  }
