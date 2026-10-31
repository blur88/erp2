import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import type { ApiResponse } from '@/types'
import { getCredentials } from './auth/credentials'
import { sessionCoordinator } from './session'

// Get API base URL dynamically with VPN compatibility
const getApiBaseUrl = () => {
  // Try to get from window environment config first
  const envUrl = (window as any).__ENV__?.VITE_API_BASE_URL
  if (envUrl) return envUrl

  // For VPN users, try relative path first (uses NGINX proxy)
  if (window.location.origin !== 'http://localhost:3000') {
    return '/api'
  }

  // Default for local development
  return 'http://localhost:3001/api'
}

// Create axios instance with enhanced error handling for VPN
const api: AxiosInstance = axios.create({
  timeout: 30000,
  // Add retry logic for network issues common with VPN
  validateStatus: (status) => status >= 200 && status < 300, // Only accept 2xx status codes
})

// Request interceptor to inject access token and set baseURL
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Set base URL
    if (!config.baseURL) {
      config.baseURL = getApiBaseUrl()
    }

    // Inject Authorization header if access token exists
    const session = await getCredentials()
    const accessToken = session?.accessToken
    const previousSessionId = (config as any)._sessionId
    if (previousSessionId && previousSessionId !== session?.id) throw new Error('Session ended before request')
    ;(config as any)._sessionId = session?.id
    ;(config as any)._accessToken = accessToken

    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`
    } else if (config.headers) {
      delete config.headers.Authorization
    }

    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

let cachedStore: any = null
const getStore = async () => {
  if (!cachedStore) {
    const storeModule = await import('@/store')
    cachedStore = storeModule.store
  }
  return cachedStore
}

// Response interceptor with token refresh and error handling
api.interceptors.response.use(
  async (response: AxiosResponse) => {
    const session = await getCredentials()
    if ((response.config as any)._sessionId !== session?.id) throw new Error('Session ended before response')
    return response
  },
  async (error) => {
    const originalRequest = error.config
    if (!originalRequest) return Promise.reject(error)

    // Enhanced error handling for VPN connectivity issues
    if (error.code === 'NETWORK_ERROR' || error.code === 'ECONNREFUSED') {
      console.warn('Network connectivity issue detected. This may be VPN-related.')

      // If using direct localhost and it fails, try relative path
      if (error.config?.baseURL?.includes('localhost:3001')) {
        try {
          const retryConfig = { ...error.config, baseURL: '/api' }
          return await api.request(retryConfig)
        } catch (retryError) {
          console.error('Retry with relative path also failed:', retryError)
        }
      }
    }

    // Handle 401 Unauthorized - attempt token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      try {
        const store = await getStore()
        const session = await getCredentials()
        if (originalRequest._sessionId && originalRequest._sessionId !== session?.id) {
          throw new Error('Session ended before refresh')
        }
        const refreshToken = session?.refreshToken
        if (!refreshToken) {
          const { clearLocalSessionForMissingRefreshToken } = await import('./auth/signOut')
          await clearLocalSessionForMissingRefreshToken(store.dispatch)
          throw error
        }

        const { authApi } = await import('./authApi')
        try {
          await sessionCoordinator.refreshAfter401(session!.id, originalRequest._accessToken, async token => (await authApi.refreshToken(token)).data)
        } catch (refreshError) {
          if (!sessionCoordinator.getSnapshot()) {
            const { clearLocalSessionForFailedRefresh } = await import('./auth/signOut')
            await clearLocalSessionForFailedRefresh(store.dispatch, session!.id, refreshToken)
          }
          throw refreshError
        }
        return api(originalRequest)
      } catch (refreshError) {
        return Promise.reject(refreshError)
      }
    }

    // Handle 403 Forbidden
    if (error.response?.status === 403) {
      console.error('Access forbidden:', error.response.data?.message)
    }

    return Promise.reject(error)
  }
)

// Generic API methods
export class ApiService {
  static async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await api.get(url, config)
    return response.data
  }

  static async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await api.post(url, data, config)
    return response.data
  }

  static async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await api.put(url, data, config)
    return response.data
  }

  static async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await api.patch(url, data, config)
    return response.data
  }

  static async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await api.delete(url, config)
    return response.data
  }

  // File upload helper
  static async uploadFile<T>(url: string, file: File, config?: AxiosRequestConfig): Promise<T> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await api.post(url, formData, {
      ...config,
      headers: {
        ...config?.headers,
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  }

  // File download helper
  static async downloadFile(url: string, filename?: string): Promise<void> {
    const response = await api.get(url, {
      responseType: 'blob',
    })

    const blob = new Blob([response.data])
    const downloadUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = filename || 'download'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(downloadUrl)
  }
}

export default api
