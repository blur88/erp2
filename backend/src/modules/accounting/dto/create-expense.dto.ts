export type UpdateExpenseDto = Partial<CreateExpenseDto>;

export interface CreateExpenseDto {
  expenseDate: string;
  payee?: string;
  description: string;
  expenseAccountId: string;
  totalAmount: string;
  notes?: string;
}

export interface PayExpenseDto {
  payments: { paymentMethodId: string; amount: string; paymentDate: string; reference?: string }[];
}

export interface RefundExpenseDto {
  refunds: { sourcePaymentId: string; amount: string; refundDate: string; reference?: string }[];
}

export interface ListExpensesParams {
  page?: number;
  limit?: number;
  search?: string;
  fromDate?: string;
  toDate?: string;
  expenseAccountId?: string;
  documentStatus?: 'DRAFT' | 'CANCELLED';
  paymentStatus?: 'UNPAID' | 'PARTIAL' | 'PAID';
  sortBy?: 'expenseNumber' | 'expenseDate' | 'totalAmount';
  sortOrder?: 'ASC' | 'DESC';
}
