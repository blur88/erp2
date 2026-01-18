import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import type { ApiResponse } from '@/types'
import { store } from '@/store'
import { setAccessToken, clearAuth } from '@/store/slices/authSlice'

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
  headers: {
    'Content-Type': 'application/json',
  },
  // Add retry logic for network issues common with VPN
  validateStatus: (status) => status >= 200 && status < 300, // Only accept 2xx status codes
})

// Request interceptor to inject access token and set baseURL
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Set base URL
    if (!config.baseURL) {
      config.baseURL = getApiBaseUrl()
    }

    // Inject Authorization header if access token exists
    const state = store.getState()
    const accessToken = state.auth?.accessToken

    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }

    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Token refresh state management
let isRefreshing = false
let failedQueue: Array<{
  resolve: (value?: any) => void
  reject: (error?: any) => void
}> = []

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })

  failedQueue = []
}

// Response interceptor with token refresh and error handling
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response
  },
  async (error) => {
    const originalRequest = error.config

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
      if (isRefreshing) {
        // Queue the request while token is being refreshed
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`
            }
            return api(originalRequest)
          })
          .catch((err) => {
            return Promise.reject(err)
          })
      }

      originalRequest._retry = true
      isRefreshing = true

      const state = store.getState()
      const refreshToken = state.auth?.refreshToken

      if (!refreshToken) {
        // No refresh token available, logout
        store.dispatch(clearAuth())
        window.location.href = '/login'
        return Promise.reject(error)
      }

      try {
        // Import authApi dynamically to avoid circular dependency
        const { authApi } = await import('./authApi')
        const response = await authApi.refreshToken(refreshToken)

        const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data

        // Update tokens in Redux store
        store.dispatch(
          setAccessToken(newAccessToken)
        )

        // Also update refresh token if it changed (token rotation)
        if (newRefreshToken !== refreshToken) {
          // This would require a new action, but for now we'll update via setCredentials
          // The refresh endpoint returns full AuthResponse, so we can update everything
          const { setCredentials } = await import('@/store/slices/authSlice')
          store.dispatch(setCredentials(response.data))
        }

        // Process queued requests with new token
        processQueue(null, newAccessToken)

        // Retry original request with new token
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
        }
        return api(originalRequest)
      } catch (refreshError) {
        // Token refresh failed, logout user
        processQueue(refreshError, null)
        store.dispatch(clearAuth())

        // Force redirect to login page for invalid/expired tokens
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }

        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
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