export type OwnerEquityType = 'CAPITAL_INJECTION' | 'CASH_DRAWING' | 'STOCK_DRAWING'
export type OwnerEquityDocumentStatus = 'DRAFT' | 'COMPLETED' | 'CANCELLED'
export type OwnerEquitySettlementStatus = 'UNSETTLED' | 'PARTIAL' | 'SETTLED' | 'OVERSETTLED'

export interface OwnerEquitySettlement {
  id: string
  equityDocumentId: string
  paymentMethodId: string
  settlementDate: string
  amount: string
  reference: string | null
  sourceSettlementId: string | null
  paymentMethod?: { id: string; code: string; name: string }
  remainingRefundable?: string
  createdAt: string
  updatedAt: string
}

export interface OwnerEquityDocument {
  id: string
  referenceNumber: string
  equityDate: string
  type: OwnerEquityType
  description: string
  notes: string | null
  documentStatus: OwnerEquityDocumentStatus
  settlementStatus: OwnerEquitySettlementStatus | null
  totalAmount: string | null
  settledAmount: string | null
  balance: string | null
  productId: string | null
  quantity: string | null
  unitCost: string | null
  totalCost: string | null
  completedAt: string | null
  completedBy: string | null
  createdAt: string
  updatedAt: string
  settlements?: OwnerEquitySettlement[]
  product?: { id: string; slug: string; name: string } | null
}

export interface OwnerEquityListParams {
  page?: number
  limit?: number
  search?: string
  fromDate?: string
  toDate?: string
  type?: OwnerEquityType
  documentStatus?: OwnerEquityDocumentStatus
  settlementStatus?: OwnerEquitySettlementStatus
  sortBy?: 'referenceNumber' | 'equityDate' | 'totalAmount'
  sortOrder?: 'ASC' | 'DESC'
}

export interface CreateOwnerEquityRequest {
  type: OwnerEquityType
  equityDate: string
  description: string
  notes?: string
  totalAmount?: string
  productId?: string
  quantity?: string
}

export interface UpdateOwnerEquityRequest {
  equityDate?: string
  description?: string
  notes?: string
  totalAmount?: string
  productId?: string
  quantity?: string
}

export interface OwnerEquitySettlementLine {
  paymentMethodId: string
  amount: string
  settlementDate: string
  reference?: string
}

export interface SettleOwnerEquityRequest {
  settlements: OwnerEquitySettlementLine[]
}

export interface OwnerEquityRefundLine {
  sourceSettlementId: string
  amount: string
  refundDate: string
  reference?: string
}

export interface RefundOwnerEquityRequest {
  refunds: OwnerEquityRefundLine[]
}
