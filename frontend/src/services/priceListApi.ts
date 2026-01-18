import { ApiService } from './api'
import type { PriceList, PriceListItem, PaginatedResponse, QueryParams } from '@/types'

export interface BulkUpdatePriceDto {
  productId: string
  price: number
  costBasis?: number
  marginPercent?: number
  minQuantity?: number
  maxQuantity?: number
  notes?: string
}

export interface CopyPriceListDto {
  code: string
  name: string
  description?: string
  effectiveFrom?: string
  effectiveTo?: string
}

export interface PercentageAdjustmentDto {
  percentage: number
  adjustmentType: 'increase' | 'decrease'
  roundTo?: number
  affectCostBasis?: boolean
}

export const priceListApi = {
  // Price Lists CRUD
  async getPriceLists(params?: QueryParams) {
    return ApiService.get<PaginatedResponse<PriceList>>('/price-lists', { params })
  },

  async getPriceList(id: string) {
    return ApiService.get<PriceList>(`/price-lists/${id}`)
  },

  async getPriceListByCode(code: string) {
    return ApiService.get<PriceList>(`/price-lists/code/${code}`)
  },

  async createPriceList(data: Partial<PriceList>) {
    return ApiService.post<PriceList>('/price-lists', data)
  },

  async updatePriceList(id: string, data: Partial<PriceList>) {
    return ApiService.patch<PriceList>(`/price-lists/${id}`, data)
  },

  async deletePriceList(id: string) {
    return ApiService.delete(`/price-lists/${id}`)
  },

  // Price List special operations
  async setDefaultPriceList(id: string) {
    return ApiService.post<PriceList>(`/price-lists/${id}/set-default`)
  },

  async getEffectivePriceLists() {
    return ApiService.get<PriceList[]>('/price-lists/effective')
  },

  async getDefaultPriceList() {
    return ApiService.get<PriceList>('/price-lists/default')
  },

  // Price List Items
  async getPriceListItems(priceListId: string) {
    return ApiService.get<PriceListItem[]>(`/price-lists/${priceListId}/items`)
  },

  async getProductPriceListItems(productId: string) {
    return ApiService.get<PriceListItem[]>(`/price-lists/product/${productId}/items`)
  },

  async getProductPrice(priceListId: string, productId: string) {
    return ApiService.get<PriceListItem>(`/price-lists/${priceListId}/products/${productId}`)
  },

  async bulkUpdatePrices(priceListId: string, items: BulkUpdatePriceDto[]) {
    return ApiService.post<{ updated: number; created: number; failed: number; items: PriceListItem[] }>(
      `/price-lists/${priceListId}/items/bulk`,
      { items }
    )
  },

  async copyPriceList(priceListId: string, data: CopyPriceListDto) {
    return ApiService.post<PriceList>(`/price-lists/${priceListId}/copy`, data)
  },

  async applyPercentageAdjustment(priceListId: string, data: PercentageAdjustmentDto) {
    return ApiService.post<{ updated: number; items: PriceListItem[] }>(
      `/price-lists/${priceListId}/adjust`,
      data
    )
  },
}
