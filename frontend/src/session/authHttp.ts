import axios, { AxiosInstance } from 'axios'
import { getApiBaseUrl } from '@/services/authApi'
import type { LoginCredentials, TokenResponse } from './types'

export const SESSION_PROTOCOL_HEADER = 'X-ERP-Session-Protocol'
export const SESSION_PROTOCOL_VERSION = '2'

const REFRESH_TIMEOUT_MS = 15000

export class RefreshRejectedError extends Error {
  status = 401
}

export interface AuthHttp {
  login(
    credentials: LoginCredentials,
    signal?: AbortSignal,
  ): Promise<TokenResponse & { requiresPasswordChange?: boolean }>
  refresh(refreshToken: string): Promise<TokenResponse>
  logout(refreshToken: string): Promise<void>
}

function createClient(): AxiosInstance {
  const client = axios.create({
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
  })

  client.interceptors.request.use((config) => {
    if (!config.baseURL) config.baseURL = getApiBaseUrl()
    config.headers.set(SESSION_PROTOCOL_HEADER, SESSION_PROTOCOL_VERSION)
    return config
  })

  return client
}

export function createAuthHttp(client: AxiosInstance = createClient()): AuthHttp {
  return {
    async login(credentials, signal) {
      const response = await client.post<TokenResponse & { requiresPasswordChange?: boolean }>(
        '/auth/login',
        credentials,
        { signal },
      )
      return response.data
    },

    async refresh(refreshToken) {
      try {
        const response = await client.post<TokenResponse>('/auth/refresh', { refreshToken }, { timeout: REFRESH_TIMEOUT_MS })
        return response.data
      } catch (error) {
        const status = (error as { response?: { status?: number } }).response?.status
        if (status === 401) throw new RefreshRejectedError('refresh rejected')
        throw error
      }
    },

    async logout(refreshToken) {
      try {
        await client.post('/auth/logout', { refreshToken })
      } catch (error) {
        console.warn('session logout request failed', error)
      }
    },
  }
}
