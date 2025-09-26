import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import type { ApiResponse } from '@/types'

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

// Request interceptor to set baseURL dynamically (auth removed - no token needed)
api.interceptors.request.use(
  (config) => {
    if (!config.baseURL) {
      config.baseURL = getApiBaseUrl()
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling (auth removed) with VPN support
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response
  },
  async (error) => {
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
    
    return Promise.reject(error)
  }
)

// Generic API methods
export class ApiService {
  static async get<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await api.get(url, config)
    return response.data
  }

  static async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await api.post(url, data, config)
    return response.data
  }

  static async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await api.put(url, data, config)
    return response.data
  }

  static async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await api.patch(url, data, config)
    return response.data
  }

  static async delete<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await api.delete(url, config)
    return response.data
  }

  // File upload helper
  static async uploadFile<T>(url: string, file: File, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
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