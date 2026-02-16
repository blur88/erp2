import { ApiService } from './api';
import type { OwnerEquityTransaction, PaginatedResponse } from '@/types';

const BASE_URL = '/accounting/owner-equity';

export const ownerEquityApi = {
  getAll: (params?: any): Promise<PaginatedResponse<OwnerEquityTransaction>> =>
    ApiService.get(BASE_URL, { params }),

  getById: (id: string): Promise<OwnerEquityTransaction> =>
    ApiService.get(`${BASE_URL}/${id}`),

  create: (data: {
    transactionDate: string;
    type: string;
    amount: number;
    paymentMethodId: string;
    description?: string;
  }): Promise<OwnerEquityTransaction> =>
    ApiService.post(BASE_URL, data),

  update: (
    id: string,
    data: {
      transactionDate?: string;
      type?: string;
      amount?: number;
      paymentMethodId?: string;
      description?: string;
    },
  ): Promise<OwnerEquityTransaction> => ApiService.patch(`${BASE_URL}/${id}`, data),

  delete: (id: string): Promise<void> => ApiService.delete(`${BASE_URL}/${id}`),

  post: (id: string): Promise<OwnerEquityTransaction> =>
    ApiService.post(`${BASE_URL}/${id}/post`),

  bulkPost: (ids: string[]): Promise<{ posted: number; failed: number }> =>
    ApiService.post(`${BASE_URL}/bulk-post`, { ids }),

  bulkDelete: (ids: string[]): Promise<{ deleted: number; failed: number }> =>
    ApiService.post(`${BASE_URL}/bulk-delete`, { ids }),
};
