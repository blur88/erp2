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

export interface PricingScheme {
  name: string
  currency: string
}

export interface PriceCostingSettings {
  id: string
  currency: string
  costingMethod: string
  customerPricingSchemes: PricingScheme[]
  createdAt: string
  updatedAt: string
  isActive: boolean
}

export interface UpdatePriceCostingSettingsDto {
  currency?: string
  costingMethod?: string
  customerPricingSchemes?: PricingScheme[]
}

export interface DocumentNumberConfig {
  documentName: string
  prefix: string
  numberFormat: string
  nextNumber: number
}

export interface DocumentNumberSettings {
  id: string
  configurations: DocumentNumberConfig[]
  createdAt: string
  updatedAt: string
}

export interface UpdateDocumentNumberSettingsDto {
  configurations: DocumentNumberConfig[]
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

  /**
   * Get price and costing settings
   */
  async getPriceCostingSettings(): Promise<ApiResponse<PriceCostingSettings>> {
    return ApiService.get<PriceCostingSettings>('/settings/price-costing')
  }

  /**
   * Update price and costing settings
   */
  async updatePriceCostingSettings(data: UpdatePriceCostingSettingsDto): Promise<ApiResponse<PriceCostingSettings>> {
    return ApiService.put<PriceCostingSettings>('/settings/price-costing', data)
  }

  /**
   * Get active pricing schemes (for use in other modules)
   */
  async getActivePricingSchemes(): Promise<ApiResponse<PricingScheme[]>> {
    return ApiService.get<PricingScheme[]>('/settings/pricing-schemes')
  }

  /**
   * Get default currency
   */
  async getDefaultCurrency(): Promise<ApiResponse<{ currency: string }>> {
    return ApiService.get<{ currency: string }>('/settings/default-currency')
  }

  /**
   * Get document number settings
   */
  async getDocumentNumberSettings(): Promise<ApiResponse<DocumentNumberSettings>> {
    return ApiService.get<DocumentNumberSettings>('/settings/document-numbers')
  }

  /**
   * Update document number settings
   */
  async updateDocumentNumberSettings(data: UpdateDocumentNumberSettingsDto): Promise<ApiResponse<DocumentNumberSettings>> {
    return ApiService.put<DocumentNumberSettings>('/settings/document-numbers', data)
  }
}

export const settingsApi = new SettingsApi()
