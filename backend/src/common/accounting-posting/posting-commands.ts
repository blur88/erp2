import { AccountingSourceType, PostingType, PaymentChannel } from './enums';

interface Base { sourceRef: string; entryDate: string; createdBy?: string; }

export interface PostSalesPaymentCmd extends Base { salesOrderId: string; paymentRowId: string; channel: PaymentChannel; amount: string; }
export interface PostSalesRefundCmd extends Base { salesOrderId: string; refundRowId: string; channel: PaymentChannel; amount: string; }
export interface PostSalesFulfillmentCmd extends Base { salesOrderId: string; revenueAmount: string; cogsAmount: string; }
export interface PostPurchasePaymentCmd extends Base { purchaseOrderId: string; paymentRowId: string; channel: PaymentChannel; amount: string; }
export interface PostPurchaseRefundCmd extends Base { purchaseOrderId: string; refundRowId: string; channel: PaymentChannel; amount: string; }
export interface PostPurchaseReceiveCmd extends Base { purchaseOrderId: string; amount: string; }
export interface PostStockAdjustmentCmd extends Base { adjustmentId: string; increaseAmount: string; decreaseAmount: string; }
export interface PostOpeningBalanceCmd extends Base { accountId: string; amount: string; }
export interface PostExpensePaymentCmd extends Base { expenseId: string; paymentRowId: string; expenseAccountId: string; channel: PaymentChannel; amount: string; }
export interface PostExpenseRefundCmd extends Base { expenseId: string; refundRowId: string; expenseAccountId: string; channel: PaymentChannel; amount: string; }
export interface PostOwnerCapitalInjectionCmd extends Base { equityDocumentId: string; settlementRowId: string; channel: PaymentChannel; amount: string; }
export interface PostOwnerCapitalInjectionRefundCmd extends Base { equityDocumentId: string; settlementRowId: string; channel: PaymentChannel; amount: string; }
export interface PostOwnerCashDrawingCmd extends Base { equityDocumentId: string; settlementRowId: string; channel: PaymentChannel; amount: string; }
export interface PostOwnerCashDrawingRefundCmd extends Base { equityDocumentId: string; settlementRowId: string; channel: PaymentChannel; amount: string; }
// sourceEventId is the freshly created stock movement id, NOT the document id.
// Each completion cycle mints a new movement, so a re-completion after an
// uncomplete gets a distinct idempotency key and cannot collide with the older
// reversed entry (spec §5.2).
export interface PostOwnerStockDrawingCmd extends Base { equityDocumentId: string; stockMovementId: string; amount: string; }
export interface ReverseEntryCmd { originalEntryId: string; entryDate: string; createdBy?: string; }

export { AccountingSourceType, PostingType };
export type { PaymentChannel };
