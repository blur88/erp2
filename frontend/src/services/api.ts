import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import type { ApiResponse } from '@/types'
import { getSessionRuntime } from '@/session/registry'
import { SessionEndedError, type SessionRef } from '@/session/types'

// Get API base URL dynamically with VPN compatibility
const getApiBaseUrl = () => {
  if (typeof window === 'undefined') return '/api'
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
  validateStatus: (status) => status >= 200 && status < 300,
})

interface SessionConfig extends InternalAxiosRequestConfig {
  __sessionRef?: SessionRef
  __sends?: number
  __refreshes?: number
}

const timingEnabled = () =>
  typeof sessionStorage !== 'undefined' && sessionStorage.getItem('erp-session-timing') === '1'

const recordGate = (op: 'gate-before' | 'gate-after', ms: number) => {
  if (!timingEnabled()) return
  const w = window as unknown as { __erpSessionTimings?: Array<{ op: string; ms: number }> }
  if (!w.__erpSessionTimings) w.__erpSessionTimings = []
  if (w.__erpSessionTimings.length >= 5000) return
  w.__erpSessionTimings.push({ op, ms })
}

// Request interceptor: reconcile before sending, attach token and abort signal.
api.interceptors.request.use(
  async (config: SessionConfig) => {
    if (!config.baseURL) {
      config.baseURL = getApiBaseUrl()
    }

    const runtime = getSessionRuntime()
    const started = timingEnabled() ? performance.now() : 0
    const { ref, accessToken, signal } = await runtime!.beginRequest()
    if (timingEnabled()) recordGate('gate-before', performance.now() - started)

    config.__sessionRef = ref
    if (config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    if (signal) config.signal = signal

    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor: deliver only for the same session; refresh on 401.
api.interceptors.response.use(
  async (response: AxiosResponse) => {
    const config = response.config as SessionConfig
    if (config.__sessionRef) {
      const started = timingEnabled() ? performance.now() : 0
      const ok = await getSessionRuntime()!.canDeliver(config.__sessionRef)
      if (timingEnabled()) recordGate('gate-after', performance.now() - started)
      if (!ok) throw new SessionEndedError('session ended before delivery')
    }
    return response
  },
  async (error) => {
    const originalRequest = error.config as SessionConfig | undefined

    if (error.response?.status === 401 && originalRequest) {
      const sends = originalRequest.__sends ?? 0
      const refreshes = originalRequest.__refreshes ?? 0
      const ref = originalRequest.__sessionRef

      if (ref && sends < 3 && refreshes < 2) {
        const outcome = await getSessionRuntime()!.handleUnauthorized(ref)
        if (outcome === 'retry') {
          originalRequest.__sends = sends + 1
          originalRequest.__refreshes = refreshes + 1
          return api.request(originalRequest)
        }
        return Promise.reject(error)
      }

      if (ref && sends >= 3) {
        await getSessionRuntime()!.endAfterFinalUnauthorized(ref)
      }
      return Promise.reject(error)
    }

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
