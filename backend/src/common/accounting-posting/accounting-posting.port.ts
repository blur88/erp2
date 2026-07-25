import { EntityManager } from 'typeorm';
import {
  PostSalesPaymentCmd, PostSalesRefundCmd, PostSalesFulfillmentCmd,
  PostPurchasePaymentCmd, PostPurchaseRefundCmd, PostPurchaseReceiveCmd,
  PostStockAdjustmentCmd, PostOpeningBalanceCmd, PostExpensePaymentCmd, PostExpenseRefundCmd,
  ReverseEntryCmd, AccountingSourceType, PostingType,
} from './posting-commands';

export const ACCOUNTING_POSTING_PORT = 'ACCOUNTING_POSTING_PORT';

export interface PostResult { journalEntryId: string; }

export interface AccountingPostingPort {
  postSalesPayment(cmd: PostSalesPaymentCmd, manager: EntityManager): Promise<PostResult>;
  postSalesRefund(cmd: PostSalesRefundCmd, manager: EntityManager): Promise<PostResult>;
  postSalesFulfillment(cmd: PostSalesFulfillmentCmd, manager: EntityManager): Promise<{ revenueEntryId: string; cogsEntryId: string | null }>;
  postPurchasePayment(cmd: PostPurchasePaymentCmd, manager: EntityManager): Promise<PostResult>;
  postPurchaseRefund(cmd: PostPurchaseRefundCmd, manager: EntityManager): Promise<PostResult>;
  postPurchaseReceive(cmd: PostPurchaseReceiveCmd, manager: EntityManager): Promise<PostResult>;
  postStockAdjustment(cmd: PostStockAdjustmentCmd, manager: EntityManager): Promise<PostResult>;
  postOpeningBalance(cmd: PostOpeningBalanceCmd, manager: EntityManager): Promise<PostResult>;
  postExpensePayment(cmd: PostExpensePaymentCmd, manager: EntityManager): Promise<PostResult>;
  postExpenseRefund(cmd: PostExpenseRefundCmd, manager: EntityManager): Promise<PostResult>;
  reverseEntry(cmd: ReverseEntryCmd, manager: EntityManager): Promise<PostResult>;
  reverseEntriesForDocument(
    sourceType: AccountingSourceType,
    sourceDocumentId: string,
    postingTypes: PostingType[],
    entryDate: string,
    manager: EntityManager,
    createdBy?: string,
  ): Promise<PostResult[]>;
}
