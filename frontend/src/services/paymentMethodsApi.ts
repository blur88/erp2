import { ApiService } from './api';
import type { PaymentMethodConfig, PaginatedResponse } from '@/types';

const BASE_URL = '/settings/payment-methods';

export const paymentMethodsApi = {
  getAll: (params?: any): Promise<PaginatedResponse<PaymentMethodConfig>> =>
    ApiService.get(BASE_URL, { params }),

  getActive: (): Promise<PaymentMethodConfig[]> =>
    ApiService.get(`${BASE_URL}/active`),

  getById: (id: string): Promise<PaymentMethodConfig> =>
    ApiService.get(`${BASE_URL}/${id}`),

  create: (data: Partial<PaymentMethodConfig>): Promise<PaymentMethodConfig> =>
    ApiService.post(BASE_URL, data),

  update: (id: string, data: Partial<PaymentMethodConfig>): Promise<PaymentMethodConfig> =>
    ApiService.patch(`${BASE_URL}/${id}`, data),

  delete: (id: string): Promise<void> =>
    ApiService.delete(`${BASE_URL}/${id}`),

  getDeleted: (): Promise<PaymentMethodConfig[]> =>
    ApiService.get(`${BASE_URL}/deleted`),

  restore: (id: string): Promise<void> =>
    ApiService.post(`${BASE_URL}/${id}/restore`, {}),

  permanentDelete: (id: string): Promise<void> =>
    ApiService.delete(`${BASE_URL}/${id}/permanent`),
};
