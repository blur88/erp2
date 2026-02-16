import { ApiService } from './api';
import type { ExpenseRecord, PaginatedResponse } from '@/types';

const BASE_URL = '/accounting/expenses';

export const expenseApi = {
  getAll: (params?: any): Promise<PaginatedResponse<ExpenseRecord>> =>
    ApiService.get(BASE_URL, { params }),

  getById: (id: string): Promise<ExpenseRecord> =>
    ApiService.get(`${BASE_URL}/${id}`),

  create: (data: {
    expenseDate: string;
    expenseAccountId: string;
    amount: number;
    paymentMethodId: string;
    description?: string;
    vendor?: string;
  }): Promise<ExpenseRecord> => ApiService.post(BASE_URL, data),

  update: (
    id: string,
    data: {
      expenseDate?: string;
      expenseAccountId?: string;
      amount?: number;
      paymentMethodId?: string;
      description?: string;
      vendor?: string;
    },
  ): Promise<ExpenseRecord> => ApiService.patch(`${BASE_URL}/${id}`, data),

  delete: (id: string): Promise<void> => ApiService.delete(`${BASE_URL}/${id}`),

  post: (id: string): Promise<ExpenseRecord> => ApiService.post(`${BASE_URL}/${id}/post`),

  bulkPost: (ids: string[]): Promise<{ posted: number; failed: number }> =>
    ApiService.post(`${BASE_URL}/bulk-post`, { ids }),

  bulkDelete: (ids: string[]): Promise<{ deleted: number; failed: number }> =>
    ApiService.post(`${BASE_URL}/bulk-delete`, { ids }),
};
