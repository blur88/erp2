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
export interface ReverseEntryCmd { originalEntryId: string; entryDate: string; createdBy?: string; }

export { AccountingSourceType, PostingType };
export type { PaymentChannel };
