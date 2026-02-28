import { ApiService } from './api'

interface CompanySettings {
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

interface UpdateCompanySettingsDto {
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

interface PriceCostingSettings {
  id: string
  currency: string
  costingMethod: string
  dateFormat: string
  timeFormat: string
  numberFormat: string
  createdAt: string
  updatedAt: string
  isActive: boolean
}

interface UpdatePriceCostingSettingsDto {
  currency?: string
  costingMethod?: string
  dateFormat?: string
  timeFormat?: string
  numberFormat?: string
}

export interface DocumentNumberConfig {
  documentName: string
  prefix: string
  numberFormat: string
  nextNumber: number
}

interface DocumentNumberSettings {
  id: string
  configurations: DocumentNumberConfig[]
  createdAt: string
  updatedAt: string
}

interface UpdateDocumentNumberSettingsDto {
  configurations: DocumentNumberConfig[]
}

class SettingsApi {
  /**
   * Get company settings
   */
  async getCompanySettings(): Promise<CompanySettings> {
    return ApiService.get<CompanySettings>('/settings/company')
  }

  /**
   * Update company settings
   */
  async updateCompanySettings(data: UpdateCompanySettingsDto): Promise<CompanySettings> {
    return ApiService.put<CompanySettings>('/settings/company', data)
  }

  /**
   * Upload company logo
   */
  async uploadLogo(file: File): Promise<CompanySettings> {
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
  async deleteLogo(): Promise<CompanySettings> {
    return ApiService.delete<CompanySettings>('/settings/company/logo')
  }

  /**
   * Get price and costing settings
   */
  async getPriceCostingSettings(): Promise<PriceCostingSettings> {
    return ApiService.get<PriceCostingSettings>('/settings/price-costing')
  }

  /**
   * Update price and costing settings
   */
  async updatePriceCostingSettings(data: UpdatePriceCostingSettingsDto): Promise<PriceCostingSettings> {
    return ApiService.put<PriceCostingSettings>('/settings/price-costing', data)
  }

  /**
   * Get default currency
   */
  async getDefaultCurrency(): Promise<{ currency: string }> {
    return ApiService.get<{ currency: string }>('/settings/default-currency')
  }

  /**
   * Get document number settings
   */
  async getDocumentNumberSettings(): Promise<DocumentNumberSettings> {
    return ApiService.get<DocumentNumberSettings>('/settings/document-numbers')
  }

  /**
   * Update document number settings
   */
  async updateDocumentNumberSettings(data: UpdateDocumentNumberSettingsDto): Promise<DocumentNumberSettings> {
    return ApiService.put<DocumentNumberSettings>('/settings/document-numbers', data)
  }
}

export const settingsApi = new SettingsApi()
