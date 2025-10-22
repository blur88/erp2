import { ApiService } from './api'

export interface ModuleInfo {
  name: string
  version: string
  description: string
  modules: string[]
  features: string[]
}

export const moduleApi = {
  async getAvailableModules(): Promise<string[]> {
    try {
      const response = await ApiService.get<ModuleInfo>('/info')
      // ApiService.get returns response.data directly, so response is ModuleInfo
      const moduleInfo = response as any as ModuleInfo
      return moduleInfo?.modules || []
    } catch (error) {
      // Backend is not available, return empty array to hide all modules
      console.warn('Backend not available, hiding all modules:', error)
      return []
    }
  },

  async checkHealth(): Promise<boolean> {
    try {
      await ApiService.get('/health')
      return true
    } catch (error) {
      return false
    }
  }
}