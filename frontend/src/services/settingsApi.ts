import { ApiService } from './api'
import type { ApiResponse } from '@/types'

export interface CompanySettings {
  id: string
  name: string
  address: string
  city: string
  state?: string
  postalCode?: string
  country: string
  phone?: string
  email?: string
  website?: string
  miscInfo?: string
  logoUrl?: string
  createdAt: string
  updatedAt: string
}

export interface UpdateCompanySettingsDto {
  name: string
  address: string
  city: string
  state?: string
  postalCode?: string
  country: string
  phone?: string
  email?: string
  website?: string
  miscInfo?: string
}

class SettingsApi {
  /**
   * Get company settings
   */
  async getCompanySettings(): Promise<ApiResponse<CompanySettings>> {
    return ApiService.get<CompanySettings>('/settings/company')
  }

  /**
   * Update company settings
   */
  async updateCompanySettings(data: UpdateCompanySettingsDto): Promise<ApiResponse<CompanySettings>> {
    return ApiService.put<CompanySettings>('/settings/company', data)
  }

  /**
   * Upload company logo
   */
  async uploadLogo(file: File): Promise<ApiResponse<CompanySettings>> {
    const formData = new FormData()
    formData.append('logo', file)

    return ApiService.post<CompanySettings>('/settings/company/logo', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  }

  /**
   * Delete company logo
   */
  async deleteLogo(): Promise<ApiResponse<CompanySettings>> {
    return ApiService.delete<CompanySettings>('/settings/company/logo')
  }
}

export const settingsApi = new SettingsApi()
