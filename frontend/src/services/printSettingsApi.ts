import ApiService from './api'

interface PrintSettings {
  id: string
  logoUrl?: string
  companyName?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  miscInfo?: string
  salesPerPageFooter?: string
  salesEndOfDocFooter?: string
  purchasingPerPageFooter?: string
  purchasingEndOfDocFooter?: string
  inventoryPerPageFooter?: string
  inventoryEndOfDocFooter?: string
  reportPerPageFooter?: string
  reportEndOfDocFooter?: string
  salesOrderTemplate?: any
  invoiceTemplate?: any
  paymentReceiptTemplate?: any
  purchaseOrderTemplate?: any
  grnTemplate?: any
  vendorPaymentTemplate?: any
  createdAt: string
  updatedAt: string
}

interface UpdatePrintSettingsDto {
  logoUrl?: string
  companyName?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  miscInfo?: string
  salesPerPageFooter?: string
  salesEndOfDocFooter?: string
  purchasingPerPageFooter?: string
  purchasingEndOfDocFooter?: string
  inventoryPerPageFooter?: string
  inventoryEndOfDocFooter?: string
  reportPerPageFooter?: string
  reportEndOfDocFooter?: string
  salesOrderTemplate?: any
  invoiceTemplate?: any
  paymentReceiptTemplate?: any
  purchaseOrderTemplate?: any
  grnTemplate?: any
  vendorPaymentTemplate?: any
}

export const printSettingsApi = {
  /**
   * Get print settings
   */
  async getPrintSettings(): Promise<PrintSettings> {
    const response = await ApiService.get('/print-settings')
    return response.data
  },

  /**
   * Update print settings
   */
  async updatePrintSettings(data: UpdatePrintSettingsDto): Promise<PrintSettings> {
    const response = await ApiService.put('/print-settings', data)
    return response.data
  },

  /**
   * Import settings from company settings
   */
  async importFromCompany(companySettings: any): Promise<PrintSettings> {
    const response = await ApiService.post('/print-settings/import-from-company', companySettings)
    return response.data
  },

  /**
   * Upload logo
   */
  async uploadLogo(file: File): Promise<{ logoUrl: string; message: string }> {
    const formData = new FormData()
    formData.append('file', file)
    const response = await ApiService.post('/print-settings/upload-logo', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },
}
