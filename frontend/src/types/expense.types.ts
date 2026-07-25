export type ExpenseDocumentStatus = 'DRAFT' | 'CANCELLED'
export type ExpensePaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID'

export interface ExpensePaymentRow {
  id: string
  expenseId: string
  paymentMethodId: string
  paymentDate: string
  amount: string
  reference: string | null
  sourcePaymentId: string | null
  paymentMethod?: { id: string; code: string; name: string }
  remainingRefundable?: string
}

export interface Expense {
  id: string
  expenseNumber: string
  expenseDate: string
  payee: string | null
  description: string
  expenseAccountId: string
  expenseAccount?: { id: string; code: string; name: string }
  totalAmount: string
  paidAmount: string
  balance: string
  documentStatus: ExpenseDocumentStatus
  paymentStatus: ExpensePaymentStatus
  notes: string | null
  createdAt: string
  updatedAt: string
  payments?: ExpensePaymentRow[]
}
