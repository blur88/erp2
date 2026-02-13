import { ApiService } from './api';
import type { Settlement, PaginatedResponse, PendingSettlementSummary } from '@/types';

const BASE_URL = '/accounting/settlements';

export const settlementsApi = {
  getAll: (params?: any): Promise<PaginatedResponse<Settlement>> =>
    ApiService.get(BASE_URL, { params }),

  getById: (id: string): Promise<Settlement> =>
    ApiService.get(`${BASE_URL}/${id}`),

  create: (data: {
    paymentMethodId: string;
    settlementDate: string;
    paymentIds: string[];
    reference?: string;
    notes?: string;
  }): Promise<Settlement> =>
    ApiService.post(BASE_URL, data),

  cancel: (id: string): Promise<Settlement> =>
    ApiService.post(`${BASE_URL}/${id}/cancel`),

  getPendingSummary: (): Promise<PendingSettlementSummary[]> =>
    ApiService.get(`${BASE_URL}/pending-summary`),

  getPendingPayments: (paymentMethodId: string): Promise<any[]> =>
    ApiService.get(`${BASE_URL}/pending-payments/${paymentMethodId}`),
};
